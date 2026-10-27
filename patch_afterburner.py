import re

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'r') as f:
    content = f.read()

def replace_block(text, start_marker, end_marker, replacement):
    start = text.find(start_marker)
    if start == -1: return text
    end = text.find(end_marker, start)
    if end == -1: return text
    return text[:start] + replacement + text[end + len(end_marker):]

content = replace_block(content,
    '// Afterburner Toggle',
    '}\n        }',
    '''// Afterburner Toggle
            FlightToggleButton(
                getState = { physics.isAfterburner },
                onToggle = { physics.isAfterburner = !physics.isAfterburner },
                activeColor = Color(0xFFB3261E),
                inactiveColor = Color(0xFF4A4458),
                activeTextColor = Color(0xFFE6E1E5),
                inactiveTextColor = Color(0xFFE6E1E5),
                modifier = Modifier.size(64.dp).testTag("afterburner_button")
            ) {
                Text("BURN", fontSize = 10.sp)
            }
        }'''
)

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'w') as f:
    f.write(content)
