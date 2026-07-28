import io
F = r"C:\Users\ShadowBlade\Documents\ONYXX_TECH\onyxx tech web\Onyxx-Tech\admin-dashboard.html"
s = io.open(F, encoding="utf-8", newline="").read()
old = "openQuotationFile('${q.file_url}')"
n = s.count(old)
s = s.replace(old, "openQuotationFile('${escArg(q.file_url)}')")
io.open(F, "w", encoding="utf-8", newline="").write(s)
print(f"  escaped {n} openQuotationFile call sites")
