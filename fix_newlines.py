with open('app/src/main/java/com/example/ui/FlightControls.kt', 'r') as f:
    c = f.read()

c = c.replace('"BRAKES\nON"', '"BRAKES\\nON"')
c = c.replace('"FLAPS\nDN"', '"FLAPS\\nDN"')
c = c.replace('"FLAPS\nUP"', '"FLAPS\\nUP"')

with open('app/src/main/java/com/example/ui/FlightControls.kt', 'w') as f:
    f.write(c)

