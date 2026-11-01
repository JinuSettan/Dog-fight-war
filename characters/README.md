# characters/
Drop extra character `.glb` files here (people; one or many meshes/materials; T- or A-pose; any size).
GitHub Actions runs `tools/process_people.py` on this folder at build time: it rigs them, makes a light crowd version, and they
appear in the lobby character list and in the walking crowd. Files that fail are skipped with a warning.
