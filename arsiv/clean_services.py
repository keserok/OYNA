import re

# MatchCreate.tsx
with open('views/MatchCreate.tsx', 'r') as f:
    content = f.read()

content = content.replace("Kaleci Kirala", "Kaleci Davet Et")
content = content.replace("Hakem Kirala", "Hakem Davet Et")

with open('views/MatchCreate.tsx', 'w') as f:
    f.write(content)

# ServiceDashboard.tsx
with open('views/ServiceDashboard.tsx', 'r') as f:
    content = f.read()

# Remove Wallet Tab button
wallet_tab_pattern = re.compile(r'<\s*button[^>]*onClick=\{\(\)\s*=>\s*setActiveTab\(\'WALLET\'\)\}.*?</button>', re.DOTALL)
content = wallet_tab_pattern.sub('', content)

# Remove Pricing Tab button
pricing_tab_pattern = re.compile(r'<\s*button[^>]*onClick=\{\(\)\s*=>\s*setActiveTab\(\'PRICING\'\)\}.*?</button>', re.DOTALL)
content = pricing_tab_pattern.sub('', content)

# Remove the render conditions
# We don't necessarily have to remove the render logic if the tabs are gone, but let's clean up
content = re.sub(r'\{activeTab === \'PRICING\' && renderPricingView\(\)\}', '', content)
content = re.sub(r'\{activeTab === \'WALLET\' && renderWalletView\(\)\}', '', content)
content = re.sub(r'\{activeTab === \'PRICING\' && \'Fiyatlandırma\'\}', '', content)
content = re.sub(r'\{activeTab === \'WALLET\' && \'Cüzdan\'\}', '', content)

with open('views/ServiceDashboard.tsx', 'w') as f:
    f.write(content)

print("Cleaned MatchCreate and ServiceDashboard")
