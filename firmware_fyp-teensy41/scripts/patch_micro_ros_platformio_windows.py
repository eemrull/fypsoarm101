Import("env")

import os
from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> bool:
    text = path.read_text(encoding="utf-8")
    if new in text:
        return False
    if old not in text:
        return False
    path.write_text(text.replace(old, new), encoding="utf-8")
    print(f"[micro-ROS patch] {label}: patched {path}")
    return True


def patch_extra_script(path: Path) -> bool:
    changed = False
    changed |= replace_once(
        path,
        "\"{} {} -DCLOCK_MONOTONIC=0 -D'__attribute__(x)='\".format(' '.join(env['CFLAGS']), ' '.join(env['CCFLAGS']))",
        "\"{} {} -DCLOCK_MONOTONIC=0\".format(' '.join(env['CFLAGS']), ' '.join(env['CCFLAGS']))",
        "extra_script C flags",
    )
    changed |= replace_once(
        path,
        "\"{} {} -fno-rtti -DCLOCK_MONOTONIC=0 -D'__attribute__(x)='\".format(' '.join(env['CXXFLAGS']), ' '.join(env['CCFLAGS']))",
        "\"{} {} -fno-rtti -DCLOCK_MONOTONIC=0\".format(' '.join(env['CXXFLAGS']), ' '.join(env['CCFLAGS']))",
        "extra_script CXX flags",
    )
    changed |= replace_once(
        path,
        "    python_env_path = env['PROJECT_CORE_DIR'] + \"/penv/bin/activate\"\n",
        "    if os.name == \"nt\":\n"
        "        python_env_path = env['PROJECT_CORE_DIR'] + \"/penv/Scripts/activate\"\n"
        "    else:\n"
        "        python_env_path = env['PROJECT_CORE_DIR'] + \"/penv/bin/activate\"\n",
        "extra_script python env path",
    )
    return changed


def patch_utils(path: Path) -> bool:
    changed = False
    changed |= replace_once(
        path,
        "import subprocess\n",
        "import os\nimport shutil\nimport subprocess\n",
        "utils imports",
    )
    changed |= replace_once(
        path,
        "def run_cmd(command, env=None):\n"
        "    return subprocess.run(command,\n"
        "        capture_output = True,\n"
        "        shell = True,\n"
        "        env=env\n"
        "    )\n",
        "def _resolve_bash():\n"
        "    git_bash = r\"C:\\\\Program Files\\\\Git\\\\bin\\\\bash.exe\"\n"
        "    if os.path.exists(git_bash):\n"
        "        return git_bash\n\n"
        "    bash = shutil.which(\"bash\")\n"
        "    if not bash:\n"
        "        return None\n\n"
        "    if \"system32\\\\bash.exe\" in bash.lower():\n"
        "        return None\n\n"
        "    return bash\n\n\n"
        "def run_cmd(command, env=None):\n"
        "    bash = _resolve_bash()\n"
        "    if os.name == \"nt\" and bash:\n"
        "        bash_command = command.replace(\"\\\\\", \"/\")\n"
        "        return subprocess.run(\n"
        "            [bash, \"-lc\", bash_command],\n"
        "            capture_output=True,\n"
        "            env=env,\n"
        "        )\n\n"
        "    return subprocess.run(\n"
        "        command,\n"
        "        capture_output=True,\n"
        "        shell=True,\n"
        "        env=env,\n"
        "    )\n",
        "utils run_cmd",
    )
    return changed


def patch_library_builder(path: Path) -> bool:
    changed = False
    changed |= replace_once(
        path,
        "        self.build_folder = library_folder + \"/build\"\n"
        "        self.distro = distro\n"
        "\n"
        "        self.dev_packages = []\n"
        "        self.mcu_packages = []\n"
        "\n"
        "        self.dev_folder = self.build_folder + '/dev'\n"
        "        self.dev_src_folder = self.dev_folder + '/src'\n"
        "        self.mcu_folder = self.build_folder + '/mcu'\n"
        "        self.mcu_src_folder = self.mcu_folder + '/src'\n",
        "        self.distro = distro\n"
        "\n"
        "        self.dev_packages = []\n"
        "        self.mcu_packages = []\n"
        "\n"
        "        if sys.platform.startswith(\"win\"):\n"
        "            # Keep generated object/dependency paths under Windows MAX_PATH.\n"
        "            self.build_folder = library_folder + \"/b\"\n"
        "            self.dev_folder = self.build_folder + '/d'\n"
        "            self.dev_src_folder = self.dev_folder + '/s'\n"
        "            self.mcu_folder = self.build_folder + '/m'\n"
        "            self.mcu_src_folder = self.mcu_folder + '/s'\n"
        "        else:\n"
        "            self.build_folder = library_folder + \"/build\"\n"
        "            self.dev_folder = self.build_folder + '/dev'\n"
        "            self.dev_src_folder = self.dev_folder + '/src'\n"
        "            self.mcu_folder = self.build_folder + '/mcu'\n"
        "            self.mcu_src_folder = self.mcu_folder + '/src'\n",
        "library_builder short build dirs",
    )
    changed |= replace_once(
        path,
        "    def build_dev_environment(self):\n"
        "        print(\"Building micro-ROS dev dependencies\")\n"
        "        \n"
        "        # Fix build: Ignore rmw_test_fixture_implementation in rolling\n"
        "        touch_command = ''\n"
        "        if self.distro in ('rolling', 'kilted'):\n"
        "            touch_command = 'touch src/ament_cmake_ros/rmw_test_fixture_implementation/COLCON_IGNORE && '\n"
        "        \n"
        "        command = \"cd {} && {} . {} && colcon build --cmake-args -DBUILD_TESTING=OFF -DPython3_EXECUTABLE=`which python`\".format(self.dev_folder, touch_command, self.python_env)\n"
        "        result = run_cmd(command, env=self.env)\n"
        "\n"
        "        if 0 != result.returncode:\n"
        "            print(\"Build dev micro-ROS environment failed: \\n {}\".format(result.stderr.decode(\"utf-8\")))\n"
        "            sys.exit(1)\n",
        "    def build_dev_environment(self):\n"
        "        print(\"Building micro-ROS dev dependencies\")\n"
        "        python_executable = sys.executable.replace(\"\\\\\", \"/\")\n"
        "\n"
        "        touch_commands = []\n"
        "        if self.distro in ('rolling', 'kilted'):\n"
        "            touch_commands.append('touch src/ament_cmake_ros/rmw_test_fixture_implementation/COLCON_IGNORE')\n"
        "        if sys.platform.startswith(\"win\"):\n"
        "            touch_commands.append('touch src/ament_cmake/ament_cmake_auto/COLCON_IGNORE')\n"
        "\n"
        "        touch_command = ''\n"
        "        if touch_commands:\n"
        "            touch_command = ' && '.join(touch_commands) + ' && '\n"
        "\n"
        "        dev_env = self.env.copy()\n"
        "        cmake_compiler_args = \"\"\n"
        "        if sys.platform.startswith(\"win\"):\n"
        "            toolchain_bin = os.path.expanduser(\n"
        "                \"~/.platformio/packages/toolchain-gccarmnoneeabi-teensy/bin\"\n"
        "            ).replace(\"\\\\\", \"/\")\n"
        "            cc = f\"{toolchain_bin}/arm-none-eabi-gcc.exe\"\n"
        "            cxx = f\"{toolchain_bin}/arm-none-eabi-g++.exe\"\n"
        "            ar = f\"{toolchain_bin}/arm-none-eabi-ar.exe\"\n"
        "            if os.path.exists(cc):\n"
        "                dev_env[\"CC\"] = cc\n"
        "                dev_env[\"CXX\"] = cxx\n"
        "                dev_env[\"AR\"] = ar\n"
        "                dev_env[\"PATH\"] = toolchain_bin + os.pathsep + dev_env.get(\"PATH\", \"\")\n"
        "                cmake_compiler_args = (\n"
        "                    f\" -DCMAKE_C_COMPILER={cc} -DCMAKE_CXX_COMPILER={cxx}\"\n"
        "                )\n"
        "\n"
        "        command = \"cd {} && {} . {} && colcon build --packages-ignore-regex=.*_cpp --cmake-args -G Ninja -DBUILD_TESTING=OFF -DCMAKE_SUPPRESS_REGENERATION=ON -DCMAKE_SYSTEM_NAME=Generic -DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY{} -DPython3_EXECUTABLE={}\".format(\n"
        "            self.dev_folder,\n"
        "            touch_command,\n"
        "            self.python_env,\n"
        "            cmake_compiler_args,\n"
        "            python_executable,\n"
        "        )\n"
        "        result = run_cmd(command, env=dev_env)\n"
        "\n"
        "        if 0 != result.returncode:\n"
        "            print(\"Build dev micro-ROS environment failed: \\n {}\".format(result.stderr.decode(\"utf-8\")))\n"
        "            sys.exit(1)\n",
        "library_builder build_dev_environment",
    )
    changed |= replace_once(
        path,
        "        python_executable = sys.executable.replace(\"\\\\\", \"/\")\n"
        "\n"
        "        touch_commands = []\n",
        "        python_executable = sys.executable.replace(\"\\\\\", \"/\")\n"
        "\n"
        "        src_workspace = os.path.basename(self.dev_src_folder)\n"
        "        touch_commands = []\n",
        "library_builder dev src workspace var",
    )
    changed |= replace_once(
        path,
        "            touch_commands.append('touch src/ament_cmake_ros/rmw_test_fixture_implementation/COLCON_IGNORE')\n",
        "            touch_commands.append(f'touch {src_workspace}/ament_cmake_ros/rmw_test_fixture_implementation/COLCON_IGNORE')\n",
        "library_builder rolling ignore path",
    )
    changed |= replace_once(
        path,
        "            touch_commands.append('touch src/ament_cmake/ament_cmake_auto/COLCON_IGNORE')\n",
        "            touch_commands.append(f'touch {src_workspace}/ament_cmake/ament_cmake_auto/COLCON_IGNORE')\n",
        "library_builder ament_auto ignore path",
    )
    changed |= replace_once(
        path,
        "    def build_mcu_environment(self, meta_file, toolchain_file, user_meta = \"\"):\n"
        "        print(\"Building micro-ROS library\")\n"
        "\n"
        "        common_meta_path = self.library_folder + '/metas/common.meta'\n"
        "        colcon_command = '. {} && colcon build --merge-install --packages-ignore-regex=.*_cpp --metas {} {} {} --cmake-args -DCMAKE_POSITION_INDEPENDENT_CODE:BOOL=OFF  -DTHIRDPARTY=ON  -DBUILD_SHARED_LIBS=OFF  -DBUILD_TESTING=OFF  -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE={} -DPython3_EXECUTABLE=`which python`'.format(self.python_env, common_meta_path, meta_file, user_meta, toolchain_file)\n"
        "        command = \"cd {} && . {}/install/setup.sh && {}\".format(self.mcu_folder, self.dev_folder, colcon_command)\n"
        "        result = run_cmd(command, env=self.env)\n"
        "\n"
        "        if 0 != result.returncode:\n"
        "            print(\"Build mcu micro-ROS environment failed: \\n{}\".format(result.stderr.decode(\"utf-8\")))\n"
        "            sys.exit(1)\n",
        "    def build_mcu_environment(self, meta_file, toolchain_file, user_meta = \"\"):\n"
        "        print(\"Building micro-ROS library\")\n"
        "        python_executable = sys.executable.replace(\"\\\\\", \"/\")\n"
        "\n"
        "        common_meta_path = self.library_folder + '/metas/common.meta'\n"
        "        colcon_command = '. {} && colcon build --merge-install --packages-ignore-regex=.*_cpp --metas {} {} {} --cmake-args -G Ninja -DCMAKE_SUPPRESS_REGENERATION=ON -DCMAKE_OBJECT_PATH_MAX=128 -DCMAKE_POSITION_INDEPENDENT_CODE:BOOL=OFF  -DTHIRDPARTY=ON  -DBUILD_SHARED_LIBS=OFF  -DBUILD_TESTING=OFF  -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE={} -DPython3_EXECUTABLE={}'.format(\n"
        "            self.python_env,\n"
        "            common_meta_path,\n"
        "            meta_file,\n"
        "            user_meta,\n"
        "            toolchain_file,\n"
        "            python_executable,\n"
        "        )\n"
        "        if sys.platform.startswith(\"win\"):\n"
        "            command = \"cd {} && {}\".format(self.mcu_folder, colcon_command)\n"
        "            build_env = self.env.copy()\n"
        "            dev_install = (self.dev_folder + \"/install\").replace(\"\\\\\", \"/\")\n"
        "            build_env[\"AMENT_PREFIX_PATH\"] = (\n"
        "                dev_install + \";\" + build_env.get(\"AMENT_PREFIX_PATH\", \"\")\n"
        "            ).strip(\";\")\n"
        "            build_env[\"CMAKE_PREFIX_PATH\"] = (\n"
        "                dev_install + \";\" + build_env.get(\"CMAKE_PREFIX_PATH\", \"\")\n"
        "            ).strip(\";\")\n"
        "            build_env[\"PATH\"] = (\n"
        "                dev_install + \"/Scripts;\" + build_env.get(\"PATH\", \"\")\n"
        "            ).strip(\";\")\n"
        "\n"
        "            python_paths = []\n"
        "            if os.path.exists(dev_install):\n"
        "                for package_dir in os.listdir(dev_install):\n"
        "                    site_packages = os.path.join(\n"
        "                        dev_install, package_dir, \"Lib\", \"site-packages\"\n"
        "                    )\n"
        "                    if os.path.exists(site_packages):\n"
        "                        python_paths.append(site_packages.replace(\"\\\\\", \"/\"))\n"
        "\n"
        "            if python_paths:\n"
        "                build_env[\"PYTHONPATH\"] = (\n"
        "                    \";\".join(python_paths + [build_env.get(\"PYTHONPATH\", \"\")])\n"
        "                ).strip(\";\")\n"
        "            result = run_cmd(command, env=build_env)\n"
        "        else:\n"
        "            command = \"cd {} && . {}/install/setup.sh && {}\".format(\n"
        "                self.mcu_folder, self.dev_folder, colcon_command\n"
        "            )\n"
        "            result = run_cmd(command, env=self.env)\n"
        "\n"
        "        if 0 != result.returncode:\n"
        "            print(\"Build mcu micro-ROS environment failed: \\n{}\".format(result.stderr.decode(\"utf-8\")))\n"
        "            sys.exit(1)\n",
        "library_builder build_mcu_environment",
    )
    changed |= replace_once(
        path,
        "        command = \"cd {} && {} . {} && colcon build --build-base b --install-base i --log-base l --packages-ignore-regex=.*_cpp --cmake-args -G Ninja -DBUILD_TESTING=OFF -DCMAKE_SUPPRESS_REGENERATION=ON -DCMAKE_SYSTEM_NAME=Generic -DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY{} -DPython3_EXECUTABLE={}\".format(\n",
        "        command = \"cd {} && {} . {} && colcon --log-base l build --build-base b --install-base i --packages-ignore-regex=.*_cpp --cmake-args -G Ninja -DBUILD_TESTING=OFF -DCMAKE_SUPPRESS_REGENERATION=ON -DCMAKE_SYSTEM_NAME=Generic -DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY{} -DPython3_EXECUTABLE={}\".format(\n",
        "library_builder dev colcon short bases",
    )
    changed |= replace_once(
        path,
        "        colcon_command = '. {} && colcon build --merge-install --build-base b --install-base i --log-base l --packages-ignore-regex=.*_cpp --metas {} {} {} --cmake-args -G Ninja -DCMAKE_SUPPRESS_REGENERATION=ON -DCMAKE_OBJECT_PATH_MAX=128 -DCMAKE_POSITION_INDEPENDENT_CODE:BOOL=OFF  -DTHIRDPARTY=ON  -DBUILD_SHARED_LIBS=OFF  -DBUILD_TESTING=OFF  -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE={} -DPython3_EXECUTABLE={}'.format(\n",
        "        colcon_command = '. {} && colcon --log-base l build --merge-install --build-base b --install-base i --packages-ignore-regex=.*_cpp --metas {} {} {} --cmake-args -G Ninja -DCMAKE_SUPPRESS_REGENERATION=ON -DCMAKE_OBJECT_PATH_MAX=128 -DCMAKE_POSITION_INDEPENDENT_CODE:BOOL=OFF  -DTHIRDPARTY=ON  -DBUILD_SHARED_LIBS=OFF  -DBUILD_TESTING=OFF  -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE={} -DPython3_EXECUTABLE={}'.format(\n",
        "library_builder mcu colcon short bases",
    )
    changed |= replace_once(
        path,
        "            dev_install = (self.dev_folder + \"/install\").replace(\"\\\\\", \"/\")\n",
        "            dev_install = (self.dev_folder + \"/i\").replace(\"\\\\\", \"/\")\n",
        "library_builder dev install short path",
    )
    changed |= replace_once(
        path,
        "        for root, dirs, files in os.walk(self.mcu_folder + \"/install/lib\"):\n",
        "        for root, dirs, files in os.walk(self.mcu_folder + \"/i/lib\"):\n",
        "library_builder package lib short path",
    )
    changed |= replace_once(
        path,
        "        shutil.copytree(self.build_folder + \"/mcu/install/include\", self.includes)\n",
        "        shutil.copytree(self.mcu_folder + \"/i/include\", self.includes)\n",
        "library_builder package include short path",
    )
    changed |= replace_once(
        path,
        "        command = \"{binutils}ar rc libmicroros.a $(ls *.o *.obj 2> /dev/null); rm *.o *.obj 2> /dev/null; {binutils}ranlib libmicroros.a\".format(binutils=binutils_path)\n",
        "        command = \"for f in *.o *.obj; do [ -e \\\"$f\\\" ] && {binutils}ar rcs libmicroros.a \\\"$f\\\"; done; rm *.o *.obj 2> /dev/null; {binutils}ranlib libmicroros.a\".format(binutils=binutils_path)\n",
        "library_builder package archive loop",
    )
    changed |= replace_once(
        path,
        "    def resolve_binutils_path(self):\n"
        "        if sys.platform == \"darwin\":\n"
        "            homebrew_binutils_path = \"/opt/homebrew/opt/binutils/bin/\"\n"
        "            if os.path.exists(homebrew_binutils_path):\n"
        "                return homebrew_binutils_path\n"
        "\n"
        "            print(\"ERROR: GNU binutils not found. ({}) Please install binutils with homebrew: brew install binutils\"\n"
        "                  .format(homebrew_binutils_path))\n"
        "            sys.exit(1)\n"
        "\n"
        "        return \"\"\n",
        "    def resolve_binutils_path(self):\n"
        "        if sys.platform.startswith(\"win\"):\n"
        "            toolchain_bin = os.path.expanduser(\n"
        "                \"~/.platformio/packages/toolchain-gccarmnoneeabi-teensy/bin\"\n"
        "            ).replace(\"\\\\\", \"/\")\n"
        "            return toolchain_bin + \"/arm-none-eabi-\"\n"
        "\n"
        "        if sys.platform == \"darwin\":\n"
        "            homebrew_binutils_path = \"/opt/homebrew/opt/binutils/bin/\"\n"
        "            if os.path.exists(homebrew_binutils_path):\n"
        "                return homebrew_binutils_path\n"
        "\n"
        "            print(\"ERROR: GNU binutils not found. ({}) Please install binutils with homebrew: brew install binutils\"\n"
        "                  .format(homebrew_binutils_path))\n"
        "            sys.exit(1)\n"
        "\n"
        "        return \"\"\n",
        "library_builder resolve_binutils windows",
    )
    return changed


def run():
    if os.name != "nt":
        return

    lib_root = Path(env["PROJECT_LIBDEPS_DIR"]) / env["PIOENV"] / "micro_ros_platformio"
    if not lib_root.exists():
        print(f"[micro-ROS patch] library not found at {lib_root}, skipping")
        return

    changed = False
    changed |= patch_extra_script(lib_root / "extra_script.py")
    changed |= patch_utils(lib_root / "microros_utils" / "utils.py")
    changed |= patch_library_builder(lib_root / "microros_utils" / "library_builder.py")

    if changed:
        print("[micro-ROS patch] Windows compatibility patches applied")
    else:
        print("[micro-ROS patch] already patched")


run()
