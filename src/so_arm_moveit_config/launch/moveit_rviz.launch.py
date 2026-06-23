import os
from launch import LaunchDescription
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory
from moveit_configs_utils import MoveItConfigsBuilder

def generate_launch_description():
    # Load config
    moveit_config = MoveItConfigsBuilder("so101_new_calib", package_name="so_arm_moveit_config").to_moveit_configs()

    # MANUAL FIX: Point directly to the file instead of relying on the builder
    pkg_path = get_package_share_directory("so_arm_moveit_config")
    rviz_config_file = os.path.join(pkg_path, "config", "moveit.rviz")

    rviz_node = Node(
        package="rviz2",
        executable="rviz2",
        name="rviz2",
        output="log",
        arguments=["-d", rviz_config_file], # Use the manual path
        parameters=[
            moveit_config.robot_description,
            moveit_config.robot_description_semantic,
            moveit_config.planning_pipelines,
            moveit_config.robot_description_kinematics,
            {'use_sim_time': True}, # Ensure this stays True!
        ],
    )

    return LaunchDescription([rviz_node])
