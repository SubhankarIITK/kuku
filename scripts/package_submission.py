"""Create separate source-only and confidential run archives. Never upload either."""
from pathlib import Path
import zipfile,sys,json
root=Path.cwd().resolve(); dest=root/'submission';dest.mkdir(exist_ok=True)
run_id=sys.argv[1]
assert all(c.isalnum() or c in '-_' for c in run_id)
run=root/'outputs'/run_id
assert run.is_dir() and (run/'run.json').is_file()
source_files=[root/p for p in ['package.json','package-lock.json','tsconfig.json','vite.config.ts','vercel.json','.vercelignore','.env.example','.gitignore','README.md']]
for folder in ['api','backend','frontend','tests','scripts','docs','output/pdf']:
    source_files.extend(p for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
secrets=[]
env=root/'.env'
if env.exists():
    for line in env.read_text(encoding='utf8').splitlines():
        if line.startswith(('GROQ_API_KEY=','GEMINI_API_KEY=')):
            value=line.split('=',1)[1].strip().strip('"\'')
            if len(value)>10:secrets.append(value.encode())
with zipfile.ZipFile(dest/'kuku-source.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in source_files:
        data=p.read_bytes()
        if any(secret in data for secret in secrets):raise RuntimeError('A credential was found in source; packaging stopped.')
        z.writestr('kuku-promo-intelligence/'+p.relative_to(root).as_posix(),data)
with zipfile.ZipFile(dest/'kuku-private-raw-outputs.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in run.rglob('*'):
        if p.is_file():z.write(p,arcname=f'CONFIDENTIAL-kuku-run/{run_id}/'+p.relative_to(run).as_posix())
    z.writestr('CONFIDENTIAL-kuku-run/READ-ME.txt','Private company screenplay evidence. Share only with the authorized assignment reviewer. Do not publish this archive or its content. Raw model responses are unedited; processed exports and boundary guards are separate.\n')
with zipfile.ZipFile(dest/'kuku-source.zip') as z:
    names=z.namelist()
    assert not any('/data/' in n or '/outputs/' in n or n.endswith('/.env') or '/node_modules/' in n for n in names)
print(json.dumps({'sourceFiles':len(source_files),'sourceZipBytes':(dest/'kuku-source.zip').stat().st_size,'privateOutputsZipBytes':(dest/'kuku-private-raw-outputs.zip').stat().st_size,'credentialsExcluded':True}))
