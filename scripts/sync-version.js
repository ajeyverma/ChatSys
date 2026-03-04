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

// 3. Update CHANGELOG.md (Insert new header if missing)
const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
if (fs.existsSync(changelogPath)) {
    let content = fs.readFileSync(changelogPath, 'utf8');
    const header = `## [${version}] - ${new Date().toISOString().split('T')[0]}`;

    if (!content.includes(`## [${version}]`)) {
        const template = `${header}\n\n### Added\n- \n\n### Fixed\n- \n\n### Changed\n- \n\n`;
        // Insert after the first "---" and its following line breaks
        content = content.replace(/(---[\r\n]+)/, `$1\n${template}`);
        fs.writeFileSync(changelogPath, content, 'utf8');
        console.log(`- Created new entry in CHANGELOG.md for ${version}`);
    } else {
        console.log(`- Entry for ${version} already exists in CHANGELOG.md`);
    }
}

// 4. Update RELEASE_NOTES.md (Insert new section if missing)
const releaseNotesPath = path.join(__dirname, '..', 'RELEASE_NOTES.md');
if (fs.existsSync(releaseNotesPath)) {
    let content = fs.readFileSync(releaseNotesPath, 'utf8');
    const header = `# Release Notes v${version}`;

    if (!content.includes(header)) {
        const template = `${header}\n \nDescription of what is new in this version.\n \n## What’s New\n \n* \n \n---\n \n`;
        // Prepend to the file
        content = template + content;
        fs.writeFileSync(releaseNotesPath, content, 'utf8');
        console.log(`- Created new section in RELEASE_NOTES.md for ${version}`);
    } else {
        console.log(`- Section for ${version} already exists in RELEASE_NOTES.md`);
    }
}

console.log('Version sync complete!');
