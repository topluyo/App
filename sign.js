const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// CodeSignTool yolunu bul
function findCodeSignTool() {
  const possiblePaths = [
    './CodeSignTool.bat',
    './CodeSignTool/CodeSignTool.bat',
    './CodeSignTool-**/CodeSignTool.bat'
  ];
  
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      console.log(`CodeSignTool found at: ${possiblePath}`);
      return path.resolve(possiblePath);
    }
  }
  
  // Recursive search
  try {
    const result = execSync('powershell "Get-ChildItem -Recurse -Name CodeSignTool.bat"', { encoding: 'utf8' });
    const foundPath = result.trim().split('\n')[0];
    if (foundPath) {
      console.log(`CodeSignTool found at: ${foundPath}`);
      return path.resolve(foundPath);
    }
  } catch (error) {
    console.error('CodeSignTool.bat not found');
  }
  
  throw new Error('CodeSignTool.bat not found');
}

// Dosyayı imzala
function signFile(filePath) {
  const codeSignTool = findCodeSignTool();
  
  const username = process.env.ESIGNER_USERNAME;
  const password = process.env.ESIGNER_PASSWORD;
  const credentialId = process.env.ESIGNER_CREDENTIAL_ID;
  const totpSecret = process.env.ESIGNER_TOTP;
  
  if (!username || !password || !credentialId || !totpSecret) {
    throw new Error('Missing signing credentials in environment variables');
  }
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const command = `"${codeSignTool}" sign ` +
    `-username "${username}" ` +
    `-password "${password}" ` +
    `-credential_id "${credentialId}" ` +
    `-totp_secret "${totpSecret}" ` +
    `-input_file_path "${filePath}" ` +
    `-output_dir_path "${path.dirname(filePath)}" ` +
    `-override true ` +
    `-timestamp_server https://timestamp.digicert.com ` +
    `-hash_alg SHA256`;
  
  console.log(`Signing file: ${filePath}`);
  console.log(`Command: ${command.replace(/-password "[^"]*"/, '-password "***"').replace(/-totp_secret "[^"]*"/, '-totp_secret "***"')}`);
  
  try {
    const result = execSync(command, { 
      encoding: 'utf8',
      stdio: 'inherit',
      timeout: 120000 // 2 dakika timeout
    });
    console.log(`Successfully signed: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`Failed to sign ${filePath}:`, error.message);
    throw error;
  }
}

// Ana fonksiyon
function signElectronFiles() {
  console.log('Starting code signing process...');
  
  const filesToSign = [
    'dist/win-unpacked/Topluyo.exe',
    // NSIS installer - dinamik versiyon ile
    ...require('glob').sync('dist/Topluyo-Setup-*.exe'),
    // APPX package - dinamik versiyon ile
    ...require('glob').sync('dist/Topluyo-Setup-*.appx')
  ];
  
  const existingFiles = filesToSign.filter(file => fs.existsSync(file));
  
  if (existingFiles.length === 0) {
    console.log('No files found to sign');
    return;
  }
  
  console.log(`Found ${existingFiles.length} files to sign:`);
  existingFiles.forEach(file => console.log(`  - ${file}`));
  
  for (const file of existingFiles) {
    try {
      signFile(file);
    } catch (error) {
      console.error(`Failed to sign ${file}:`, error.message);
      // Continue with other files
    }
  }
  
  console.log('Code signing process completed');
}

// Script olarak çalıştırılıyorsa
if (require.main === module) {
  signElectronFiles();
}

module.exports = { signFile, signElectronFiles };
