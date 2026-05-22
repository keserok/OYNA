import re

content = open('/Users/kerem/Desktop/Oyna_App_Kaynak/views/Studio.tsx').read()
match = re.search(r'const FORMATIONS: Record<SquadSize, Record<string, Slot\[\]>> = (\{.*?\});\n\nconst MOCK_POOL', content, re.DOTALL)
if match:
    data = match.group(1)
    lines = data.split('\n')
    for line in lines:
        if "{ id:" in line:
            x_match = re.search(r'x: (\d+)', line)
            if x_match:
                print(line.strip())
