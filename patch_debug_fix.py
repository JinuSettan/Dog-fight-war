import re

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'r') as f:
    content = f.read()

# Let's just find `.testTag("...")` and append `.debugHitbox(showDebugHitboxes)` if it doesn't already have it.
def repl(m):
    tag = m.group(0)
    if 'debugHitbox' in tag: return tag
    return tag + '.debugHitbox(showDebugHitboxes)'

content = re.sub(r'\.testTag\("[^"]+"\)(?!\.debugHitbox)', repl, content)

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'w') as f:
    f.write(content)

