import re

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'r') as f:
    content = f.read()

# Add debugHitbox to LocationOn button
content = content.replace(
    'modifier = Modifier.height(36.dp)\n                ) {\n                    Icon(Icons.Default.LocationOn',
    'modifier = Modifier.height(36.dp).debugHitbox(showDebugHitboxes)\n                ) {\n                    Icon(Icons.Default.LocationOn'
)

# Add debugHitbox to Map Style button
content = content.replace(
    'modifier = Modifier.height(36.dp)\n                ) {\n                    Icon(Icons.Default.Layers',
    'modifier = Modifier.height(36.dp).debugHitbox(showDebugHitboxes)\n                ) {\n                    Icon(Icons.Default.Layers'
)

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'w') as f:
    f.write(content)

