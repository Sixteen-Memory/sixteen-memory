"""Verify wheel allowlist and clean offline install before distribution."""
import pathlib
import subprocess
import sys
import tempfile
import venv
import zipfile

wheel = pathlib.Path(__file__).parent / "dist" / "sixteen_memory-0.3.1-py3-none-any.whl"
with zipfile.ZipFile(wheel) as archive:
    files = archive.namelist()
    assert set(name for name in files if ".dist-info/" not in name) == {
        "sixteen_memory/__init__.py", "sixteen_memory/client.py", "sixteen_memory/async_client.py", "sixteen_memory/py.typed"
    }
    assert all(not name.startswith(("/", "..")) for name in files)
with tempfile.TemporaryDirectory(prefix="sixteen-python-package-") as folder:
    venv.EnvBuilder(with_pip=True).create(folder)
    python = pathlib.Path(folder) / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    subprocess.run([str(python), "-m", "pip", "install", "--no-index", "--no-deps", str(wheel.resolve())], check=True)
    subprocess.run([str(python), "-I", "-c",
        "from sixteen_memory import SixteenMemory; import sixteen_memory; assert sixteen_memory.__version__=='0.3.1'; assert hasattr(SixteenMemory,'organize')"], check=True, cwd=folder)
print("Python wheel allowlist and isolated offline install passed.")
