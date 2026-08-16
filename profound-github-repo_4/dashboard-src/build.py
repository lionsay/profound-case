"""
Inline engine.js, assumptions.json and dashboard.js into a single self-contained
index.html, so the deployed page has no external dependencies and works from
file:// as well as from a web server.
"""
import json, re, pathlib

here = pathlib.Path(__file__).parent
tpl = (here / "template.html").read_text()
eng = (here / "engine.js").read_text()
dash = (here / "dashboard.js").read_text()
assumptions = (here / "assumptions.json").read_text()

# strip module syntax so it runs in a classic <script>
eng = re.sub(r"^export ", "", eng, flags=re.M)

out = tpl.replace("/* ASSUMPTIONS_JSON */", "const A = " + assumptions + ";")
out = out.replace("/* ENGINE_JS */", eng)
out = out.replace("/* DASHBOARD_JS */", dash)
(here / "index.html").write_text(out)
print(f"index.html written, {len(out):,} bytes, no external dependencies")
