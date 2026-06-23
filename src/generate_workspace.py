#!/usr/bin/env python3
import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
import random
import math

# --- CONFIGURATION: SET YOUR ROBOT LENGTHS HERE (in Meters) ---
# These should match your URDF / CAD
L1_BASE_HEIGHT = 0.10   # Base to Shoulder
L2_SHOULDER    = 0.25   # Shoulder to Elbow
L3_ELBOW       = 0.20   # Elbow to Wrist
L4_WRIST       = 0.10   # Wrist to End Effector

# Joint Limits (Degrees) - Matching your YAML
LIMITS = [
    (-180, 180), # J1: Base
    (-90, 90),   # J2: Shoulder
    (-150, 150), # J3: Elbow
    (-90, 90),   # J4: Wrist Pitch
    (-180, 180), # J5: Wrist Roll
    (0, 0)       # J6: Gripper (Does not affect workspace reach)
]

def get_transform(theta_deg, d, a, alpha_deg):
    """
    Calculates the DH Transformation Matrix based on Eq 3.1 in your report.
    """
    theta = np.radians(theta_deg)
    alpha = np.radians(alpha_deg)
    
    # Standard DH Matrix
    T = np.array([
        [np.cos(theta), -np.sin(theta)*np.cos(alpha),  np.sin(theta)*np.sin(alpha), a*np.cos(theta)],
        [np.sin(theta),  np.cos(theta)*np.cos(alpha), -np.cos(theta)*np.sin(alpha), a*np.sin(theta)],
        [0,              np.sin(alpha),                np.cos(alpha),               d],
        [0,              0,                            0,                           1]
    ])
    return T

def compute_fk(joints):
    """
    Computes Forward Kinematics by multiplying matrices.
    Adjust the d/a/alpha values below to match your specific DH Table.
    """
    j1, j2, j3, j4, j5, j6 = joints
    
    # --- YOUR ROBOT'S KINEMATIC CHAIN ---
    # Params: (theta, d, a, alpha)
    # This is a standard 6-DOF configuration. 
    T01 = get_transform(j1, L1_BASE_HEIGHT, 0, 90)
    T12 = get_transform(j2, 0, L2_SHOULDER, 0)
    T23 = get_transform(j3, 0, L3_ELBOW, 0)
    T34 = get_transform(j4, 0, 0, 90)
    T45 = get_transform(j5, L4_WRIST, 0, 0) 
    
    # Multiply to get End Effector Pose
    T_final = T01 @ T12 @ T23 @ T34 @ T45
    
    # Extract X, Y, Z from the last column
    x = T_final[0, 3]
    y = T_final[1, 3]
    z = T_final[2, 3]
    
    return x, y, z

def main():
    print("--- Generating Workspace Cloud (Analytical) ---")
    x_points = []
    y_points = []
    z_points = []
    
    # Generate 1000 random valid poses
    samples = 1000
    for i in range(samples):
        # Create random joint angles within limits
        rand_joints = []
        for mn, mx in LIMITS:
            rand_joints.append(random.uniform(mn, mx))
            
        x, y, z = compute_fk(rand_joints)
        x_points.append(x)
        y_points.append(y)
        z_points.append(z)

    # Plotting
    print(f"Plotting {samples} points...")
    fig = plt.figure(figsize=(10, 8))
    ax = fig.add_subplot(111, projection='3d')
    
    # Scatter plot
    img = ax.scatter(x_points, y_points, z_points, c=z_points, cmap='jet', marker='o', s=10, alpha=0.5)
    
    # Labels
    ax.set_xlabel('X (m)')
    ax.set_ylabel('Y (m)')
    ax.set_zlabel('Z (m)')
    ax.set_title(f'Robot Workspace Analysis\nRadius approx: {L2_SHOULDER + L3_ELBOW + L4_WRIST:.2f}m')
    
    # Add robot base marker
    ax.scatter([0], [0], [0], color='black', s=100, label='Robot Base')
    ax.legend()
    
    fig.colorbar(img, ax=ax, label='Height (Z)')
    plt.show()

if __name__ == '__main__':
    main()
