#!/usr/bin/env python3
"""Independent Python/SQLite oracle for Node H4H PS1 final-seat execution."""
import sqlite3
import sys
from pathlib import Path
path = Path(sys.argv[1]).resolve()
if not path.is_file():
    raise SystemExit("FAIL | missing race database: " + str(path))
db = sqlite3.connect(str(path))
db.row_factory = sqlite3.Row
checks = [
    ("event exists", "SELECT COUNT(*) FROM events WHERE id='event'", 1),
    ("one team", "SELECT COUNT(*) FROM teams WHERE event_id='event'", 1),
    ("exactly 2 members including leader", "SELECT COUNT(*) FROM membership WHERE event_id='event' AND team_id='team'", 2),
    ("one admitted candidate", "SELECT COUNT(*) FROM membership WHERE event_id='event' AND user_id<>'leader'", 1),
    ("one persisted winning operation", "SELECT COUNT(*) FROM operations WHERE event_id='event'", 1),
    ("one admission audit", "SELECT COUNT(*) FROM audit WHERE event_id='event' AND action='MEMBER_ADMITTED'", 1),
    ("team size not exceeded", "SELECT COUNT(*) FROM (SELECT team_id FROM membership GROUP BY team_id HAVING COUNT(*)>2)", 0),
    ("no cross-event mismatch", "SELECT COUNT(*) FROM membership m JOIN teams t ON m.team_id=t.id WHERE m.event_id<>t.event_id", 0),
    ("leader still a team member", "SELECT COUNT(*) FROM teams t LEFT JOIN membership m ON t.id=m.team_id AND m.user_id=t.leader WHERE m.user_id IS NULL", 0),
    ("winning operation committed", "SELECT COUNT(*) FROM operations WHERE result LIKE '%COMMITTED%'", 1),
    ("distinct member identity", "SELECT COUNT(*)-COUNT(DISTINCT user_id) FROM membership WHERE event_id='event'", 0),
    ("one used invitation", "SELECT COUNT(*) FROM invites WHERE used_by IS NOT NULL", 1),
]
passed=0
for name,query,expected in checks:
    got=db.execute(query).fetchone()[0]
    if got!=expected:
        print("FAIL | " + name + " | actual="+str(got)+" expected="+str(expected))
        sys.exit(1)
    print("VERIFIED | "+name+" | "+str(got))
    passed+=1
db.close()
print("KB_GATE:PASS checks="+str(passed))
