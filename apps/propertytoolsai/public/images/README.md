# PropertyTools AI — static images

- **`ptlogo.png`** — Horizontal logo (`PropertyToolsLogo`, same layout pattern as CloseBoss).
- **`ptlog64.png`** — 64×64 favicon (same pixels as `ptlogo64.png`); copied to **`app/icon.png`**.
- **`pt-logo180.png`** — 180×180 Apple touch icon (`metadata.icons.apple`), letterboxed from `ptlogo.png`.
- **`ptlogo64.png`** — source 64×64 mark used to create `ptlog64.png`.
- **`app-icon.png`** — legacy; favicon now uses **`app/icon.png`** + `ptlog64`.

URLs use lowercase names where possible so they work on case-sensitive hosts (e.g. Linux/Vercel).

**Update from repo `Images/`:**

| Served as    | Source file (`Propertytoolsai/Images/`) |
|--------------|-------------------------------------------|
| `ptlogo.png` | `PTLogo.png`                            |

```powershell
Copy-Item Images/PTLogo.png apps/propertytoolsai/public/images/ptlogo.png -Force
```
