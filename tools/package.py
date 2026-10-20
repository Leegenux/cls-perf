"""Build the store upload zip: extension runtime files only."""
import json, os, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mf = json.load(open(os.path.join(ROOT, "manifest.json"), encoding="utf-8"))
out = os.path.join(ROOT, f"cls-perf-{mf['version']}.zip")

files = ["manifest.json", "background.js", "content.js", "net_rules.json",
         "popup.html", "popup.js", "LICENSE", "README.md", "PRIVACY.md"]
files += sorted("icons/" + f for f in os.listdir(os.path.join(ROOT, "icons")))

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(os.path.join(ROOT, f), f)

names = zipfile.ZipFile(out).namelist()
assert "manifest.json" in names and not any(n.startswith((".git", "tools/")) for n in names)
print(out, os.path.getsize(out), "bytes,", len(names), "entries")
print(", ".join(names))
