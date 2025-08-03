const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// CodeSignTool yolunu bul
function findCodeSignTool() {
  console.log('🔍 Searching for CodeSignTool.bat...');
  
  const possiblePaths = [
    './CodeSignTool.bat',
    './CodeSignTool/CodeSignTool.bat',
    './CodeSignTool-v1.3.0/CodeSignTool.bat',
    process.cwd() + '/CodeSignTool.bat',
    process.cwd() + '/CodeSignTool/CodeSignTool.bat'
  ];
  
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      console.log(`✅ CodeSignTool found at: ${possiblePath}`);
      return path.resolve(possiblePath);
    }
  }
  
  // Recursive search
  try {
    console.log('🔍 Performing recursive search...');
    const result = execSync('dir /s /b CodeSignTool.bat', { encoding: 'utf8', cwd: process.cwd() });
    const foundPath = result.trim().split('\n')[0];
    if (foundPath && fs.existsSync(foundPath)) {
      console.log(`✅ CodeSignTool found via recursive search: ${foundPath}`);
      return foundPath;
    }
  } catch (error) {
    console.log('❌ Recursive search failed:', error.message);
  }
  
  // PowerShell search as fallback
  try {
    console.log('🔍 Trying PowerShell search...');
    const result = execSync('powershell "Get-ChildItem -Recurse -Name CodeSignTool.bat"', { encoding: 'utf8' });
    const foundPath = result.trim().split('\n')[0];
    if (foundPath) {
      const fullPath = path.resolve(foundPath);
      if (fs.existsSync(fullPath)) {
        console.log(`✅ CodeSignTool found via PowerShell: ${fullPath}`);
        return fullPath;
      }
    }
  } catch (error) {
    console.log('❌ PowerShell search failed:', error.message);
  }
  
  throw new Error('❌ CodeSignTool.bat not found in any location');
}

// Electron-builder imzalama fonksiyonu (ana export)
module.exports = async function(configuration) {
  console.log('🔐 Electron-builder signing function called');
  console.log('📁 Configuration:', configuration);
  
  const filePath = configuration.path;
  
  if (!filePath || !fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return;
  }
  
  try {
    await signFile(filePath);
    console.log(`✅ Successfully signed: ${filePath}`);
  } catch (error) {
    console.error(`❌ Failed to sign ${filePath}:`, error.message);
    throw error;
  }
};

// Dosyayı imzala
async function signFile(filePath) {
  console.log(`🔐 Starting signature process for: ${filePath}`);
  
  const codeSignTool = findCodeSignTool();
  
  const username = process.env.ESIGNER_USERNAME;
  const password = process.env.ESIGNER_PASSWORD;
  const credentialId = process.env.ESIGNER_CREDENTIAL_ID;
  const totpSecret = process.env.ESIGNER_TOTP;
  
  if (!username || !password || !credentialId || !totpSecret) {
    const missingVars = [];
    if (!username) missingVars.push('ESIGNER_USERNAME');
    if (!password) missingVars.push('ESIGNER_PASSWORD');
    if (!credentialId) missingVars.push('ESIGNER_CREDENTIAL_ID');
    if (!totpSecret) missingVars.push('ESIGNER_TOTP');
    throw new Error(`❌ Missing signing credentials: ${missingVars.join(', ')}`);
  }
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`❌ File not found: ${filePath}`);
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
  
  const safeCommand = command.replace(/-password "[^"]*"/, '-password "***"').replace(/-totp_secret "[^"]*"/, '-totp_secret "***"');
  console.log(`🔧 Command: ${safeCommand}`);
  
  return new Promise((resolve, reject) => {
    try {
      console.log(`⏳ Executing signing command...`);
      const result = execSync(command, { 
        encoding: 'utf8',
        stdio: 'inherit',
        timeout: 120000 // 2 dakika timeout
      });
      console.log(`✅ Successfully signed: ${filePath}`);
      resolve(true);
    } catch (error) {
      console.error(`❌ Failed to sign ${filePath}:`, error.message);
      reject(error);
    }
  });
}

// Ana fonksiyon (standalone kullanım için)
async function signElectronFiles() {
  console.log('Starting code signing process...');
  
  const glob = require('glob');
  const filesToSign = [
    'dist/win-unpacked/Topluyo.exe',
    // NSIS installer - dinamik versiyon ile
    ...glob.sync('dist/Topluyo-Setup-*.exe'),
    // APPX package - dinamik versiyon ile
    ...glob.sync('dist/Topluyo-Setup-*.appx')
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
      await signFile(file);
    } catch (error) {
      console.error(`Failed to sign ${file}:`, error.message);
      // Continue with other files
    }
  }
  
  console.log('Code signing process completed');
}

// Script olarak çalıştırılıyorsa
if (require.main === module) {
  signElectronFiles().catch(console.error);
}

// Ek fonksiyonları export et
module.exports.signFile = signFile;
module.exports.signElectronFiles = signElectronFiles;
