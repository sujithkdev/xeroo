module.exports = {
    appId:'in.xeroo.counter',productName:'Xeroo Counter',electronVersion:require('electron/package.json').version,
    directories:{app:'.counter-stage/app',output:'dist-counter'},asarUnpack:['node_modules/**/*','agent/**/*','print-agent.js'],
    extraResources:[{from:'.counter-stage/server',to:'server'},{from:process.execPath,to:'node.exe'},{from:'SumatraPDF.exe',to:'SumatraPDF.exe'}],
    win:{signAndEditExecutable:false,icon:'electron/tray-icon.ico'},nsis:{allowToChangeInstallationDirectory:false,oneClick:true,perMachine:false,deleteAppDataOnUninstall:false},
    artifactName:'XerooCounter-Setup-${version}.${ext}'
  };

