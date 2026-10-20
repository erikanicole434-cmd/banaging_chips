from db import query

print("Connected to:", query("SELECT DATABASE() AS db", one=True)["db"])
print("Tables:", [list(r.values())[0] for r in query("SHOW TABLES")])