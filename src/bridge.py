#!/usr/bin/env python3
import json
import math
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState
from std_msgs.msg import Float32MultiArray, String

class BridgeNode(Node):
    def __init__(self):
        super().__init__('teensy_bridge')

        self.declare_parameter('publish_rate', 50.0)
        self.declare_parameter('stale_timeout_sec', 0.5)
        self.declare_parameter('health_log_period_sec', 2.0)
        self.declare_parameter('zero_on_stale', False)
        self.declare_parameter('require_full_joint_state', True)
        self.declare_parameter('max_abs_position_rad', 6.28318530718)
        self.declare_parameter(
            'target_joint_order',
            [
                'Rotation',
                'Pitch',
                'Elbow',
                'Wrist_Pitch',
                'Wrist_Roll',
                'Jaw',
            ],
        )

        self.publish_rate = float(self.get_parameter('publish_rate').value)
        self.stale_timeout_sec = float(self.get_parameter('stale_timeout_sec').value)
        self.health_log_period_sec = float(
            self.get_parameter('health_log_period_sec').value
        )
        self.zero_on_stale = bool(self.get_parameter('zero_on_stale').value)
        self.require_full_joint_state = bool(
            self.get_parameter('require_full_joint_state').value
        )
        self.max_abs_position_rad = float(
            self.get_parameter('max_abs_position_rad').value
        )

        if self.publish_rate <= 0.0:
            self.get_logger().warn('publish_rate <= 0 is invalid; defaulting to 50Hz')
            self.publish_rate = 50.0

        # To Teensy
        self.publisher_ = self.create_publisher(Float32MultiArray, '/joint_commands', 10)
        self.health_publisher = self.create_publisher(String, '/bridge/health', 10)

        # From simulation/control stack
        self.subscription = self.create_subscription(
            JointState,
            '/joint_states',
            self.listener_callback,
            10,
        )

        # Canonical, fixed order expected by firmware
        configured_joint_order = self.get_parameter('target_joint_order').value
        if (
            isinstance(configured_joint_order, (list, tuple))
            and configured_joint_order
            and all(isinstance(name, str) and name.strip() for name in configured_joint_order)
        ):
            self.target_joints = [name.strip() for name in configured_joint_order]
        else:
            self.target_joints = [
                'Rotation',
                'Pitch',
                'Elbow',
                'Wrist_Pitch',
                'Wrist_Roll',
                'Jaw',
            ]
            self.get_logger().warn(
                'target_joint_order parameter invalid; using default firmware order'
            )

        # Last known good values, kept deterministic by index
        self.last_known_positions = [0.0] * len(self.target_joints)
        self.last_joint_state_time = self.get_clock().now()
        self.last_health_log_time = self.get_clock().now()
        self.last_stale_warn_time = self.get_clock().now()
        self.frames_received = 0
        self.frames_published = 0
        self.last_latency_ms = 0.0
        self.has_received_full_joint_state = False
        self._missing_joint_warning = set()
        self._invalid_value_warning = set()

        self.timer = self.create_timer(1.0 / self.publish_rate, self.timer_callback)
        self.health_timer = self.create_timer(0.5, self.health_callback)

        self.get_logger().info(
            (
                'Bridge started: /joint_states -> /joint_commands with fixed joint ordering '
                f'({", ".join(self.target_joints)})'
            )
        )
        self.get_logger().info(
            (
                f'params: publish_rate={self.publish_rate:.1f}Hz '
                f'stale_timeout={self.stale_timeout_sec:.2f}s '
                f'zero_on_stale={self.zero_on_stale} '
                f'require_full_joint_state={self.require_full_joint_state}'
            )
        )

    def _secs_since(self, then):
        return (self.get_clock().now() - then).nanoseconds / 1e9

    def _sanitize_position(self, value):
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(numeric):
            return None
        return max(-self.max_abs_position_rad, min(self.max_abs_position_rad, numeric))

    def _update_latency(self, msg: JointState):
        stamp = msg.header.stamp
        if stamp.sec == 0 and stamp.nanosec == 0:
            return
        now_ns = self.get_clock().now().nanoseconds
        stamp_ns = stamp.sec * 1_000_000_000 + stamp.nanosec
        latency_ns = now_ns - stamp_ns
        if latency_ns >= 0:
            self.last_latency_ms = latency_ns / 1e6

    def _extract_indexed_positions(self, msg: JointState):
        if len(set(msg.name)) != len(msg.name):
            self.get_logger().warn(
                'JointState contains duplicate joint names; first matching index wins'
            )

        name_to_index = {name: idx for idx, name in enumerate(msg.name)}
        found_count = 0
        for i, joint_name in enumerate(self.target_joints):
            idx = name_to_index.get(joint_name)
            if idx is None:
                if joint_name not in self._missing_joint_warning:
                    self._missing_joint_warning.add(joint_name)
                    self.get_logger().warn(
                        f'Joint "{joint_name}" missing in /joint_states; holding previous value'
                    )
                continue
            if idx >= len(msg.position):
                self.get_logger().warn(
                    f'Joint "{joint_name}" index out of position bounds; received malformed JointState'
                )
                continue
            sanitized = self._sanitize_position(msg.position[idx])
            if sanitized is None:
                if joint_name not in self._invalid_value_warning:
                    self._invalid_value_warning.add(joint_name)
                    self.get_logger().warn(
                        f'Joint "{joint_name}" has non-finite position value; holding previous command'
                    )
                continue
            self.last_known_positions[i] = sanitized
            found_count += 1

        if found_count == len(self.target_joints):
            if not self.has_received_full_joint_state:
                self.get_logger().info(
                    'Received first complete JointState matching configured joint order'
                )
            self.has_received_full_joint_state = True

    def listener_callback(self, msg: JointState):
        self.frames_received += 1
        self.last_joint_state_time = self.get_clock().now()

        if len(msg.name) != len(msg.position):
            self.get_logger().warn(
                f'JointState mismatch: names={len(msg.name)} positions={len(msg.position)}'
            )

        self._update_latency(msg)
        self._extract_indexed_positions(msg)

    def timer_callback(self):
        stale_sec = self._secs_since(self.last_joint_state_time)
        if self.require_full_joint_state and not self.has_received_full_joint_state:
            return

        if stale_sec > self.stale_timeout_sec and self.zero_on_stale:
            command_values = [0.0] * len(self.target_joints)
        else:
            command_values = self.last_known_positions

        command_msg = Float32MultiArray()
        command_msg.data = list(command_values)
        self.publisher_.publish(command_msg)
        self.frames_published += 1

    def health_callback(self):
        stale_sec = self._secs_since(self.last_joint_state_time)
        if stale_sec > self.stale_timeout_sec and self._secs_since(self.last_stale_warn_time) >= 1.0:
            self.last_stale_warn_time = self.get_clock().now()
            self.get_logger().warn(
                (
                    f'/joint_states stale for {stale_sec:.2f}s; '
                    f'publishing {"zero command" if self.zero_on_stale else "last-known command cache"}'
                )
            )

        elapsed_since_log = self._secs_since(self.last_health_log_time)
        if elapsed_since_log >= self.health_log_period_sec:
            self.last_health_log_time = self.get_clock().now()
            self.get_logger().info(
                (
                    f'health: rx={self.frames_received} tx={self.frames_published} '
                    f'latency={self.last_latency_ms:.2f}ms stale={stale_sec:.2f}s '
                    f'full_order={self.has_received_full_joint_state}'
                )
            )

            health_msg = String()
            health_msg.data = json.dumps(
                {
                    'rx': self.frames_received,
                    'tx': self.frames_published,
                    'latency_ms': round(self.last_latency_ms, 3),
                    'stale_sec': round(stale_sec, 3),
                    'full_joint_state': self.has_received_full_joint_state,
                    'zero_on_stale': self.zero_on_stale,
                },
                separators=(',', ':'),
            )
            self.health_publisher.publish(health_msg)

def main(args=None):
    rclpy.init(args=args)
    node = BridgeNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
