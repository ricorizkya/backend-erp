const fs = require('fs');
const path = require('path');

const dtoDirs = [
  path.join(__dirname, 'src', 'modules', 'inventory', 'dto'),
  path.join(__dirname, 'src', 'modules', 'product', 'dto')
];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let lines = content.split('\n');
  
  // Replace IsString with IsInt for properties ending with Id
  let inIdPropertyContext = false;
  
  for (let i = 0; i < lines.length; i++) {
    // Check if the current line is a property definition that ends with Id
    const propMatch = lines[i].match(/^\s+([a-zA-Z0-9_]*Id|id)\s*\??:\s*(string|number)/);
    
    if (propMatch) {
      // Look back a few lines to find @IsString() and replace it
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        if (lines[j].includes('@IsString()')) {
          lines[j] = lines[j].replace('@IsString()', '@IsInt()');
          
          // Add IsInt to imports if not there
          if (!content.includes('IsInt')) {
            lines.unshift("import { IsInt } from 'class-validator';");
            content = lines.join('\n');
          }
        }
      }
      
      // Update the typescript type
      lines[i] = lines[i].replace(/:\s*string/g, ': number');
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

dtoDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach(file => {
      if (file.endsWith('.ts')) {
        processFile(path.join(dir, file));
      }
    });
  }
});
console.log('Fixed DTOs');
