const fs = require('fs');
const path = require('path');

// 1. Get Source Version
const packagePath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const version = pkg.version;

console.log(`Syncing version: ${version}`);

// 2. Update ISS Files
const issDir = path.join(__dirname, '..', 'build', 'windows');
const issFiles = ['installer_x64.iss', 'installer_x86.iss', 'installer_arm64.iss'];

issFiles.forEach(file => {
    const fPath = path.join(issDir, file);
    if (!fs.existsSync(fPath)) return;

    let content = fs.readFileSync(fPath, 'utf8');

    // AppVersion=2.1.0
    content = content.replace(/AppVersion=[0-9.]+/g, `AppVersion=${version}`);
    // AppVerName=ChatSys 2.1.0
    content = content.replace(/AppVerName=ChatSys [0-9.]+/g, `AppVerName=ChatSys ${version}`);
    // OutputBaseFilename=ChatSys-arch-v2.1.0
    content = content.replace(/OutputBaseFilename=ChatSys-([a-z0-9]+)-v[0-9.]+/g, `OutputBaseFilename=ChatSys-$1-v${version}`);

    fs.writeFileSync(fPath, content, 'utf8');
    console.log(`- Updated ${file}`);
});

// 3. (Removed) Update CHANGELOG.md and RELEASE_NOTES.md
// User requested to remove the sync between version and markdown files.

console.log('Version sync complete!');
