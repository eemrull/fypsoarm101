import rclpy
import math
from rclpy.node import Node
from rclpy.action import ActionClient
from control_msgs.action import FollowJointTrajectory, GripperCommand
from trajectory_msgs.msg import JointTrajectoryPoint

class ArmCommander(Node):
    def __init__(self):
        super().__init__('arm_commander')
        
        # 1. Setup Arm Controller Client
        self._arm_client = ActionClient(self, FollowJointTrajectory, '/arm_controller/follow_joint_trajectory')
        self.get_logger().info('Waiting for Arm Controller...')
        self._arm_client.wait_for_server()
        
        # 2. Setup Gripper Controller Client
        self._grip_client = ActionClient(self, GripperCommand, '/gripper_controller/gripper_cmd')
        self.get_logger().info('Waiting for Gripper Controller...')
        self._grip_client.wait_for_server()
        
        self.get_logger().info('Controllers Connected!')

    def move_arm(self, positions_deg):
        goal_msg = FollowJointTrajectory.Goal()
        goal_msg.trajectory.joint_names = ['Rotation', 'Pitch', 'Elbow', 'Wrist_Pitch', 'Wrist_Roll']
        
        point = JointTrajectoryPoint()
        
        # CONVERT DEGREES TO RADIANS
        positions_rad = [math.radians(deg) for deg in positions_deg]
        
        point.positions = positions_rad
        point.time_from_start.sec = 3 # Take 3 seconds to move
        
        goal_msg.trajectory.points = [point]
        
        self.get_logger().info(f'Moving Arm to: {positions_deg} deg')
        
        # SEND AND WAIT
        future = self._arm_client.send_goal_async(goal_msg)
        rclpy.spin_until_future_complete(self, future)
        goal_handle = future.result()
        
        if not goal_handle.accepted:
            self.get_logger().error('Arm Goal Rejected!')
            return

        res_future = goal_handle.get_result_async()
        rclpy.spin_until_future_complete(self, res_future)
        self.get_logger().info('Arm Movement Complete')

    def move_gripper(self, target_position):
        # Simply send the command. For the gripper, precise timing is less critical 
        # than the trajectory, but we can still wait for it.
        
        goal_msg = GripperCommand.Goal()
        goal_msg.command.position = target_position
        goal_msg.command.max_effort = 1.0
        
        self.get_logger().info(f'Gripper Action: {target_position}')
        
        future = self._grip_client.send_goal_async(goal_msg)
        rclpy.spin_until_future_complete(self, future)
        goal_handle = future.result()
        
        if not goal_handle.accepted:
            self.get_logger().error('Gripper Goal Rejected!')
            return

        res_future = goal_handle.get_result_async()
        rclpy.spin_until_future_complete(self, res_future)
        self.get_logger().info('Gripper Action Complete')

def main(args=None):
    rclpy.init(args=args)
    commander = ArmCommander()

    # --- WAYPOINTS ---
    # format: [Rotation, Pitch, Elbow, Wrist_Pitch, Wrist_Roll]
    
    HOME_POSE  = [-90.0, 0.0, 0.0, 0.0, 0.0]
    PRE_GRASP  = [-90.0, 30.0, -30.0, 60.0, 0.0] 
    GRASP_POSE = [-90.0, 45.0, -45.0, 70.0, 0.0]  
    PLACE_POSE = [90.0, 30.0, -30.0, 60.0, 0.0]
    
    OPEN_JAW   = -0.15
    CLOSE_JAW  = 0.6
    # ----------------------------------------------------

    import time
    
    # 1. Go Home & Open
    commander.move_arm(HOME_POSE)
    commander.move_gripper(OPEN_JAW)

    # 2. Pre-Grasp (Approach)
    commander.move_arm(PRE_GRASP)

    # 3. Grasp (Go Down)
    commander.move_arm(GRASP_POSE)

    # 4. Close Gripper
    commander.move_gripper(CLOSE_JAW)

    # 5. Lift (Back to Pre-Grasp)
    commander.move_arm(PRE_GRASP)

    # 6. Move to Place
    commander.move_arm(PLACE_POSE)

    # 7. Drop
    commander.move_gripper(OPEN_JAW)

    # 8. Return Home
    commander.move_arm(HOME_POSE)

    commander.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
