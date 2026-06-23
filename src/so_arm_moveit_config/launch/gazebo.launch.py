import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription, RegisterEventHandler
from launch.event_handlers import OnProcessExit
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.actions import Node

def generate_launch_description():

    # 1. Define Paths
    # Note: Using the new package name 'so_arm_description'
    pkg_path = get_package_share_directory('so_arm_description')
    urdf_file = os.path.join(pkg_path, 'urdf', 'so101_new_calib.urdf')

    # 2. Read URDF
    with open(urdf_file, 'r') as infp:
        robot_desc = infp.read()

    # 3. Launch Gazebo Classic
    gazebo = IncludeLaunchDescription(
        PythonLaunchDescriptionSource([
            os.path.join(get_package_share_directory('gazebo_ros'), 'launch', 'gazebo.launch.py')
        ]),
        launch_arguments={'pause': 'false'}.items()
    )

    # 4. Robot State Publisher
    node_rsp = Node(
        package='robot_state_publisher',
        executable='robot_state_publisher',
        output='screen',
        parameters=[{'robot_description': robot_desc}]
    )

    # 5. Spawn Entity
    spawn_entity = Node(
        package='gazebo_ros',
        executable='spawn_entity.py',
        arguments=['-topic', 'robot_description', '-entity', 'so_arm'],
        output='screen'
    )

    # 6. Controllers
    spawn_jsb = Node(
        package="controller_manager",
        executable="spawner",
        arguments=["joint_state_broadcaster"],
        output="screen",
    )

    spawn_arm = Node(
        package="controller_manager",
        executable="spawner",
        arguments=["arm_controller"],
        output="screen",
    )

    spawn_grip = Node(
        package="controller_manager",
        executable="spawner",
        arguments=["gripper_controller"],
        output="screen",
    )

    return LaunchDescription([
        gazebo,
        node_rsp,
        spawn_entity,
        spawn_jsb,
        spawn_arm,
        spawn_grip
    ])
