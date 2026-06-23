#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from std_msgs.msg import Float32MultiArray
import tkinter as tk
from tkinter import ttk, messagebox
import math

# --- COLORS (Industrial Dark Theme) ---
BG_COLOR = "#2b2b2b"       # Dark Grey Background
PANEL_COLOR = "#313335"    # Lighter Grey for panels
TEXT_COLOR = "#a9b7c6"     # Light Text
ACCENT_COLOR = "#2196F3"   # Blue for active elements
DANGER_COLOR = "#e53935"   # Red for E-Stop
SUCCESS_COLOR = "#43a047"  # Green for Save

class IndustrialPendant(Node):
    def __init__(self):
        super().__init__('industrial_pendant')
        
        # ROS Setup
        self.publisher_ = self.create_publisher(Float32MultiArray, '/joint_commands', 1)
        self.subscriber_ = self.create_subscription(Float32MultiArray, '/servo_feedback', self.feedback_cb, 1)
        
        # State & Sync variables
        self.sync_active = False # Toggle for Kinesthetic sync
        self.joint_names = ["J1: Base (Step)", "J2: Shoulder", "J3: Elbow", 
                            "J4: Wrist Pitch", "J5: Wrist Roll", "Gripper"]
        self.limits = [
            (-180, 180), (-90, 90), (-150, 150), 
            (-90, 90), (-180, 180), (0, 100)
        ]
        
        # State
        self.current_vals = [0.0] * 6
        self.saved_waypoints = []
        
        # --- GUI SETUP ---
        self.root = tk.Tk()
        self.root.title("FYP TEACH PENDANT v1.0")
        self.root.geometry("900x600")
        self.root.configure(bg=BG_COLOR)
        
        self.setup_styles()
        self.build_ui()
        
        # Heartbeat Timer (20Hz)
        self.root.after(10, self.publish_loop)
        # ROS Spin Timer
        self.root.after(10, self.ros_spin)
        
        self.root.mainloop()

    def setup_styles(self):
        style = ttk.Style()
        style.theme_use('clam')
        
        # Configure Colors
        style.configure(".", background=BG_COLOR, foreground=TEXT_COLOR, font=("Segoe UI", 10))
        style.configure("TLabel", background=BG_COLOR, foreground=TEXT_COLOR)
        style.configure("TButton", background="#4b4b4b", foreground="white", borderwidth=1)
        style.map("TButton", background=[('active', ACCENT_COLOR)])
        
        style.configure("Header.TLabel", font=("Segoe UI", 16, "bold"), foreground="white")
        style.configure("Status.TLabel", font=("Consolas", 10), foreground="#808080")
        
        style.configure("Danger.TButton", background=DANGER_COLOR, foreground="white")
        style.map("Danger.TButton", background=[('active', "#b71c1c")])
        
        style.configure("Save.TButton", background=SUCCESS_COLOR, foreground="white")
        style.map("Save.TButton", background=[('active', "#2e7d32")])

    def build_ui(self):
        # --- HEADER ---
        header_frame = ttk.Frame(self.root)
        header_frame.pack(fill="x", padx=20, pady=15)
        
        ttk.Label(header_frame, text="FYP INDUSTRIAL CONTROLLER", style="Header.TLabel").pack(side="left")
        self.status_lbl = ttk.Label(header_frame, text="● SYSTEM READY", style="Status.TLabel", foreground=SUCCESS_COLOR)
        self.status_lbl.pack(side="right")

        # --- MAIN CONTENT (Split Left/Right) ---
        content_frame = tk.Frame(self.root, bg=BG_COLOR)
        content_frame.pack(fill="both", expand=True, padx=20, pady=5)
        
        # LEFT: JOGGING CONTROLS
        left_panel = tk.Frame(content_frame, bg=PANEL_COLOR, padx=10, pady=10)
        left_panel.pack(side="left", fill="both", expand=True, padx=(0, 10))
        
        ttk.Label(left_panel, text="MANUAL JOG", font=("Segoe UI", 12, "bold"), background=PANEL_COLOR).pack(anchor="w", pady=(0,10))
        
        self.sliders = []
        self.vars = []
        self.value_labels = []

        for i, name in enumerate(self.joint_names):
            row = tk.Frame(left_panel, bg=PANEL_COLOR)
            row.pack(fill="x", pady=5)
            
            # Label
            tk.Label(row, text=name, bg=PANEL_COLOR, fg=TEXT_COLOR, width=15, anchor="w").pack(side="left")
            
            # Variable
            var = tk.DoubleVar(value=0)
            self.vars.append(var)
            
            # Buttons and Slider
            mn, mx = self.limits[i]
            
            # [-] Button
            ttk.Button(row, text="<", width=3, command=lambda idx=i: self.jog(idx, -1)).pack(side="left")
            
            # Slider
            slider = ttk.Scale(row, from_=mn, to=mx, variable=var, orient="horizontal", command=lambda v, idx=i: self.update_val(idx, v))
            slider.pack(side="left", fill="x", expand=True, padx=5)
            self.sliders.append(slider)
            
            # [+] Button
            ttk.Button(row, text=">", width=3, command=lambda idx=i: self.jog(idx, 1)).pack(side="left")
            
            # Value Readout
            val_lbl = tk.Label(row, text="0.0", bg="black", fg="#00ff00", font=("Consolas", 10), width=6, relief="sunken")
            val_lbl.pack(side="left", padx=(5,0))
            self.value_labels.append(val_lbl)

        # RIGHT: PROGRAM / WAYPOINTS
        right_panel = tk.Frame(content_frame, bg=PANEL_COLOR, padx=10, pady=10)
        right_panel.pack(side="right", fill="both", expand=True)
        
        ttk.Label(right_panel, text="SEQUENCE EDITOR", font=("Segoe UI", 12, "bold"), background=PANEL_COLOR).pack(anchor="w", pady=(0,10))
        
        # Listbox for waypoints
        self.waypoint_list = tk.Listbox(right_panel, bg="#1e1e1e", fg=TEXT_COLOR, font=("Consolas", 9), borderwidth=0, highlightthickness=0)
        self.waypoint_list.pack(fill="both", expand=True, pady=(0, 10))
        
        # Action Buttons
        btn_row = tk.Frame(right_panel, bg=PANEL_COLOR)
        btn_row.pack(fill="x")
        
        ttk.Button(btn_row, text="SAVE POINT", style="Save.TLabel", command=self.save_point).pack(side="left", fill="x", expand=True, padx=2)
        ttk.Button(btn_row, text="DELETE LAST", command=self.delete_last).pack(side="left", fill="x", expand=True, padx=2)

        # --- FOOTER ---
        footer_frame = tk.Frame(self.root, bg=BG_COLOR, pady=15)
        footer_frame.pack(fill="x", padx=20)
        
        ttk.Button(footer_frame, text="HOME ALL", command=self.home_all).pack(side="left", padx=5)
        ttk.Button(footer_frame, text="EXPORT PYTHON CODE", command=self.export_code).pack(side="left", padx=5)
        
        # Sync Toggle
        self.sync_btn = ttk.Button(footer_frame, text="SYNC: OFF", command=self.toggle_sync)
        self.sync_btn.pack(side="left", padx=5)
        
        # Big Red E-Stop
        estop_btn = ttk.Button(footer_frame, text="EMERGENCY STOP", style="Danger.TButton", command=self.estop)
        estop_btn.pack(side="right", ipadx=20)

    # --- LOGIC ---

    def toggle_sync(self):
        self.sync_active = not self.sync_active
        if self.sync_active:
            self.sync_btn.config(text="SYNC: ON")
            self.status_lbl.config(text="● KINESTHETIC SYNC ACTIVE", foreground=ACCENT_COLOR)
        else:
            self.sync_btn.config(text="SYNC: OFF")
            self.status_lbl.config(text="● SYSTEM READY", foreground=SUCCESS_COLOR)

    def feedback_cb(self, msg):
        if not self.sync_active:
            return
            
        for i, rad in enumerate(msg.data):
            if i < 6:
                if i == 5: # Gripper
                    deg = ((rad + 0.15) / 0.75) * 100.0
                else:
                    deg = math.degrees(rad)
                
                # Clamp for safety
                mn, mx = self.limits[i]
                deg = max(mn, min(mx, deg))
                
                self.current_vals[i] = deg
                self.vars[i].set(deg)
                self.value_labels[i].config(text=f"{deg:.1f}")

    def update_val(self, idx, val):
        val = float(val)
        self.current_vals[idx] = val
        self.vars[idx].set(val)
        self.value_labels[idx].config(text=f"{val:.1f}")

    def jog(self, idx, amount):
        # Precise movement button logic
        current = self.vars[idx].get()
        new_val = current + amount
        
        # Clamp to limits
        mn, mx = self.limits[idx]
        new_val = max(mn, min(mx, new_val))
        
        self.update_val(idx, new_val)

    def publish_loop(self):
        # Only publish if we are NOT in kinesthetic sync mode, otherwise we'd fight the backdriving
        if not self.sync_active:
            msg = Float32MultiArray()
            rad_vals = []
            for i, deg in enumerate(self.current_vals):
                if i == 5:
                    rad = -0.15 + (deg / 100.0) * 0.75
                else:
                    rad = math.radians(deg)
                rad_vals.append(rad)
                
            msg.data = rad_vals
            self.publisher_.publish(msg)
            
        self.root.after(10, self.publish_loop)

    def save_point(self):
        pt = list(self.current_vals)
        self.saved_waypoints.append(pt)
        
        # Format for display
        display_str = f"P{len(self.saved_waypoints)}: " + ", ".join([f"{v:.1f}" for v in pt])
        self.waypoint_list.insert(tk.END, display_str)
        self.waypoint_list.see(tk.END) # Auto scroll

    def delete_last(self):
        if self.saved_waypoints:
            self.saved_waypoints.pop()
            self.waypoint_list.delete(tk.END)

    def home_all(self):
        for i in range(6):
            self.update_val(i, 0.0)

    def estop(self):
        self.status_lbl.config(text="● STOPPED", foreground=DANGER_COLOR)
        # In a real robot, you'd send a specific disable command here
        pass

    def export_code(self):
        print("\n# --- EXPORTED SEQUENCE ---")
        print("sequence = [")
        for pt in self.saved_waypoints:
            # Convert to Rads for export
            rads = []
            for i, deg in enumerate(pt):
                if i == 5: rad = -0.15 + (deg/100)*0.75
                else: rad = round(math.radians(deg), 3)
                rads.append(rad)
            print(f"    {rads}, # {pt}")
        print("]")
        print("# -------------------------\n")
        messagebox.showinfo("Export", "Sequence code printed to Terminal!")

    def ros_spin(self):
        rclpy.spin_once(self, timeout_sec=0)
        self.root.after(10, self.ros_spin)

def main(args=None):
    rclpy.init(args=args)
    ui = IndustrialPendant()
    try:
        rclpy.shutdown()
    except Exception:
        pass

if __name__ == '__main__':
    main()
