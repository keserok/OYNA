import re

with open('views/ProfileScreen.tsx', 'r') as f:
    content = f.read()

# Remove the Friends tab
old_tabs = """                        {[
                            { id: 'DIARY', label: 'Maç Günlüğü' },
                            { id: 'FRIENDS', label: 'Arkadaşlarım' },
                        ].map(tab => ("""
new_tabs = """                        {[
                            { id: 'DIARY', label: 'Maç Günlüğü' },
                        ].map(tab => ("""
content = content.replace(old_tabs, new_tabs)

# We need to remove the activeTab === 'FRIENDS' block.
# Let's find the boundaries.
start_str = "                    {activeTab === 'FRIENDS' && ("
end_str = "                    {activeTab === 'DIARY' && ("

start_idx = content.find(start_str)
end_idx = content.find(end_str)

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + content[end_idx:]

with open('views/ProfileScreen.tsx', 'w') as f:
    f.write(content)

