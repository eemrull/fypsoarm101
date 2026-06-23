from launch import LaunchDescription
from launch_ros.actions import Node
from moveit_configs_utils import MoveItConfigsBuilder

def generate_launch_description():
    # Load the MoveIt Configuration
    moveit_config = MoveItConfigsBuilder("so101_new_calib", package_name="so_arm_moveit_config").to_moveit_configs()

    # Start the Move Group Node
    run_move_group_node = Node(
        package="moveit_ros_move_group",
        executable="move_group",
        output="screen",
        parameters=[
            moveit_config.to_dict(),
            # THE CRITICAL FIX: Force Sim Time
            {'use_sim_time': True}, 
            {'trajectory_execution.allowed_execution_duration_scaling': 2.0},
            {'trajectory_execution.allowed_goal_duration_margin': 0.5},
            {'trajectory_execution.allow_trajectory_execution': True},
        ],
    )

    return LaunchDescription([run_move_group_node])
