#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState
from std_msgs.msg import Float32MultiArray

class BridgeNode(Node):
    def __init__(self):
        super().__init__('teensy_bridge_test')
        
        # 1. PUBLISHER (To Teensy)
        # We send the simple array of 6 floats that your Arduino code reads
        self.publisher_ = self.create_publisher(Float32MultiArray, '/joint_commands', 10)
        
        # 2. SUBSCRIBER (From Gazebo/MoveIt)
        # We listen to the simulation to see where the robot currently IS.
        # This creates a "Shadow Mode" -> Real Robot copies Sim Robot.
        self.subscription = self.create_subscription(
            JointState,
            '/joint_states',
            self.listener_callback,
            10)
            
        # 3. MAPPING
        # The Teensy expects data in a specific index order: [0, 1, 2, 3, 4, 5]
        # We must map the named joints from ROS to that specific order.
        self.target_joints = [
            'Rotation',    # Index 0: Base Stepper (DM542)
            'Pitch',       # Index 1: Shoulder (STS3215)
            'Elbow',       # Index 2: Elbow (STS3215)
            'Wrist_Pitch', # Index 3: Wrist Pitch (STS3215)
            'Wrist_Roll',  # Index 4: Wrist Roll (STS3215)
            'Jaw'          # Index 5: Gripper (STS3215)
        ]
        
        self.get_logger().info('Bridge Started. Real Robot will now mimic Gazebo...')

    def listener_callback(self, msg):
        # FAST PATH: Assuming Gazebo sends joints in the correct order 
        # (Rotation, Pitch, Elbow, Wrist_P, Wrist_R, Jaw)
        # This skips the heavy "name lookup" loop for speed.
        
        try:
            # If msg.position has 6 elements, just send it directly
            if len(msg.position) >= 6:
                command_msg = Float32MultiArray()
                
                # Direct cast to list of floats for speed
                # Verify your Gazebo Joint Order matches Teensy Order!
                # If unsure, keep your old dictionary logic, but it is slower.
                command_msg.data = [float(x) for x in msg.position[:6]] 
                
                self.publisher_.publish(command_msg)
        except Exception as e:
            self.get_logger().error(f'Error processing joint state: {e}')

def main(args=None):
    rclpy.init(args=args)
    node = BridgeNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
