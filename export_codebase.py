import os

output_file = 'oyna_codebase.txt'
allowed_extensions = ['.ts', '.tsx', '.css', '.html', '.json']
exclude_dirs = ['node_modules', '.git', 'dist', 'build', '.gemini']

with open(output_file, 'w', encoding='utf-8') as outfile:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            if any(file.endswith(ext) for ext in allowed_extensions):
                # package-lock.json exclude
                if file == 'package-lock.json':
                    continue
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as infile:
                        content = infile.read()
                        outfile.write(f"--- FILE: {file_path} ---\n")
                        outfile.write(content)
                        outfile.write("\n\n")
                except Exception as e:
                    pass
print(f"Codebase exported to {output_file}")
