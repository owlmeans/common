# OwlMeans Package Template

This is a template directory for creating new packages within the OwlMeans Common Libraries ecosystem.

## Usage

Copy this template directory when creating a new package:

```bash
cp -r packages/_tpl packages/your-new-package
cd packages/your-new-package
```

Then update:
- `package.json` - Change the package name and dependencies
- `README.md` - Replace with proper documentation following OwlMeans standards
- `src/index.ts` - Implement your package functionality

## Template Structure

- **package.json** - Base package configuration with common scripts and exports
- **tsconfig.json** - TypeScript configuration aligned with OwlMeans standards  
- **src/index.ts** - Entry point file
- **README.md** - This template documentation (replace with actual docs)