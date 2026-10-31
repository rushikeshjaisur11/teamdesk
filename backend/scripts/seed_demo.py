"""Seed a local dev workspace with believable sample data (needs DEV_LOGIN_ENABLED=true on the API).

    uv run python scripts/seed_demo.py <workspace_id> [api_base]

All people and tasks are sample data; replace with real ones before any demo to the business.
"""
import sys

import httpx

WID = sys.argv[1]
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8000"

PEOPLE = {
    "vikram": ("Vikram Nair", ["grp-data-eng"]),
    "dan": ("Dan Morris", ["grp-data-eng"]),
    "priya": ("Priya Shah", ["grp-data-approvers"]),
    "meera": ("Meera Kulkarni", ["grp-data-approvers"]),
}

TASKS = [  # (author, type, title, fields, labels, submit)
    ("priya", "spike", "Split the embeddings job by tenant",
     {"question": "Can one embeddings job per tenant run without doubling cost?", "timebox": "2 days",
      "output": "One-page recommendation with cost per tenant"}, ["ai", "cost"], True),
    ("meera", "bug", "Orders feed fails on a new upstream column",
     {"steps": "1. Add a column upstream\n2. Run the orders job", "expected": "Job logs a warning and continues",
      "actual": "Job fails with `Unrecognized field: discount_code`"}, ["pipeline"], True),
    ("priya", "story", "Alert routing for on-call",
     {"context": "P1 alerts go to a channel nobody watches at night.", "scope": "- Route P1 alerts to the on-call phone",
      "acceptance": "- A test P1 pages the on-call person within 2 minutes"}, ["ops"], True),
    ("vikram", "story", "Retry with backoff for the BigQuery loader",
     {"context": "The nightly load fails about twice a week on transient 503s.",
      "scope": "- Wrap the load call in retry with exponential backoff (3 tries)\n- Log each retry with the job id",
      "acceptance": "- A simulated 503 on the first two attempts still loads the data"}, ["ingestion"], True),
    ("dan", "tech_debt", "Upgrade Airflow provider packages",
     {"context": "Providers are two majors behind and block the Python upgrade.",
      "scope": "- Bump google and http providers\n- Fix deprecated operator imports",
      "acceptance": "- All DAGs import cleanly in CI"}, ["deps"], True),
    ("dan", "bug", "Flaky test in the dedupe stage",
     {"steps": "Run the suite 10 times", "expected": "Always green", "actual": "Fails about 1 run in 5"}, [], False),
    ("vikram", "story", "Cost dashboard per pipeline",
     {"context": "We see total cost but not which pipeline drives it.", "scope": "- Tag jobs with pipeline id"}, ["finops"], False),
]

clients = {}
for sub, (name, groups) in PEOPLE.items():
    c = httpx.Client(base_url=BASE, headers={"X-Requested-With": "TeamDesk"})
    c.post("/api/auth/dev-login", json={"sub": f"{sub}@corp.test", "name": name, "email": f"{sub}@corp.test", "groups": groups}).raise_for_status()
    clients[sub] = c

admin = httpx.Client(base_url=BASE, headers={"X-Requested-With": "TeamDesk"})  # the API's default user (an admin)
ids = []
for author, type_key, title, fields, labels, submit in TASKS:
    r = clients[author].post(f"/api/w/{WID}/tasks", json={"type_key": type_key, "title": title, "fields": fields, "labels": labels, "submit": submit})
    r.raise_for_status()
    ids.append(r.json()["id"])

clients["meera"].post(f"/api/w/{WID}/tasks/{ids[0]}/comments", json={"text": "Can we include the storage cost too? It's half the bill."}).raise_for_status()
r = clients["meera"].post(f"/api/w/{WID}/tasks/{ids[2]}/decision", json={"action": "request_changes", "reason": "Add who owns the on-call rota and how we test it."})
r.raise_for_status()
for text in ["Cache schema lookups in the loader?", "Ask platform team about a shared retry library"]:
    admin.post("/api/me/items", json={"kind": "idea", "title": text}).raise_for_status()
print("seeded", len(ids), "tasks")
