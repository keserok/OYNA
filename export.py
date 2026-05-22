import os
import zipfile

def export_project():
    workspace = '/Users/kerem/.gemini/antigravity/scratch/oyna_workspace'
    zip_path = os.path.join(workspace, 'Oyna_App_Kaynak.zip')
    txt_path = os.path.join(workspace, 'Oyna_Tum_Kodlar.txt')
    
    skip_dirs = {'.git', 'node_modules', 'dist', '.gemini', '.vite'}
    allowed_exts = {'.ts', '.tsx', '.css', '.html', '.json', '.js', '.mjs'}
    
    # Create ZIP
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(workspace):
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            for file in files:
                if file.endswith('.zip') or file.endswith('.txt'):
                    continue
                filepath = os.path.join(root, file)
                arcname = os.path.relpath(filepath, workspace)
                zipf.write(filepath, arcname)
                
    # Create Combined Text
    with open(txt_path, 'w', encoding='utf-8') as outfile:
        outfile.write("Oyna App - Tüm Kaynak Kodları\n")
        outfile.write("=============================\n\n")
        for root, dirs, files in os.walk(workspace):
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            for file in files:
                if any(file.endswith(ext) for ext in allowed_exts):
                    if 'package-lock.json' in file:
                        continue
                    filepath = os.path.join(root, file)
                    relpath = os.path.relpath(filepath, workspace)
                    outfile.write(f"\n\n{'='*60}\n>>> DOSYA: {relpath}\n{'='*60}\n\n")
                    try:
                        with open(filepath, 'r', encoding='utf-8') as infile:
                            outfile.write(infile.read())
                    except Exception as e:
                        outfile.write(f"[Okuma Hatası: {e}]\n")

if __name__ == '__main__':
    export_project()
