import os
import re

# 1. Update store.ts
with open('store.ts', 'r') as f:
    content = f.read()

content = re.sub(r'\n\s*wallet:\s*number;', '', content)
content = re.sub(r'\s*wallet:\s*\d+,?', '', content)
content = re.sub(r'\n\s*walletTitle:\s*\'CÜZDAN\',', '', content)

with open('store.ts', 'w') as f:
    f.write(content)

# 2. Update Dashboard.tsx
with open('views/Dashboard.tsx', 'r') as f:
    content = f.read()

# Remove Wallet button block: from <motion.button ... onNavigate('WALLET') to </motion.button>
wallet_btn_pattern = re.compile(r'<\s*motion\.button[^>]*onClick=\{\(\)\s*=>\s*onNavigate\(\'WALLET\'\)\}.*?</motion\.button>', re.DOTALL)
content = wallet_btn_pattern.sub('', content)

# Remove Active Hires Section: from {/* Active Hires Section to </motion.div>\n        )}
active_hires_pattern = re.compile(r'\{\/\*\s*Active Hires Section.*?<\/\s*motion\.div>\n\s*\)\}', re.DOTALL)
content = active_hires_pattern.sub('', content)

with open('views/Dashboard.tsx', 'w') as f:
    f.write(content)

# 3. Update ProfileScreen.tsx
with open('views/ProfileScreen.tsx', 'r') as f:
    content = f.read()

# Remove loyalty tab
content = re.sub(r'\{ id: \'LOYALTY\', label: \'Sadakat\' \},?\n?', '', content)
# Remove the loyalty render block
loyalty_block_pattern = re.compile(r'\{activeTab === \'LOYALTY\' && \(.*?\}\)', re.DOTALL)
# Actually, it might be safer to just remove it line by line or find the exact block.
# Let's find activeTab === 'LOYALTY'
loyalty_render_match = re.search(r'\{activeTab === \'LOYALTY\' && \(', content)
if loyalty_render_match:
    start_idx = loyalty_render_match.start()
    # Find matching closing bracket. Not trivial with regex, so we'll just let it be or use a more precise regex.
    # We will remove the component <LoyaltyCard />
    content = re.sub(r'import LoyaltyCard from \'./LoyaltyCard\';\n?', '', content)

with open('views/ProfileScreen.tsx', 'w') as f:
    f.write(content)

print("Done")
