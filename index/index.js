const childProcess = require('child_process')
const {remote} = require('electron')
const {dialog} = require('electron').remote

const fs = require('fs')
const join = require('path').join
const extract = require('extract-zip')

let vCalcContainer = document.getElementById('calc-button-container')
let vProgress = document.getElementById('progress')
let vCalcButton = document.getElementById('calc-button')
let vFileChosen = document.getElementById('file-chosen')
let vFilePath = document.getElementById('file-path')
let vMethodCount = document.getElementById('method-count')
let vFileNameContainer = document.getElementById('file-name-container')
let vUploadHint = document.getElementById('upload-hint')
let vFileNameDisplay = document.getElementById('file-name-display')
let vFileType = document.getElementById('file-type')

let progressing = false

// 拖放文件的事件
vFileChosen.ondragenter = vFileChosen.ondragover = (event) => {
  // 重写ondragover 和 ondragenter 使其可放置
  event.preventDefault()
}
vFileChosen.ondragleave = (event) => {
  event.preventDefault()
}
vFileChosen.ondrop = (event) => {
  event.preventDefault()
  let file = event.dataTransfer.files[0]
  chooseFile(file.path)
}
vFileChosen.onclick = (event) => {
  dialog.showOpenDialog({
    title: '选择文件',
    message: '请选择文件',
    properties: ['openFile'],
    filters: [
      {name: 'Custom File Type', extensions: ['apk', 'dex', 'jar']}
    ]
  }, (filePaths) => {
    if (filePaths != null && filePaths.length > 0) {
      chooseFile(filePaths[0])
    }
  })
}

function chooseFile(filePath) {
  vFilePath.value = filePath
  vFileNameContainer.style.display = 'flex'
  vUploadHint.style.display = 'none'

  let index = filePath.lastIndexOf('/')
  vFileNameDisplay.innerText = (index >= 0 ? filePath.substring(index + 1) : '')

  let extension = _getFileExtension(filePath).toLowerCase()
  if (extension === 'apk') {
    vFileType.src = '../assets/file_apk.png'
  } else if (extension === 'dex') {
    vFileType.src = '../assets/file_dex.png'
  } else if (extension === 'jar') {
    vFileType.src = '../assets/file_jar.png'
  }
}

// 计算方法数按钮的点击事件
vCalcButton.onclick = () => {
  // 检查环境变量：ANDROID_HOME
  let androidHome = process.env['ANDROID_HOME']
  if (androidHome === undefined || androidHome == null || androidHome.length === 0) {
    dialog.showMessageBox({type: 'error', title: '提示', message: '您需要设置Android的环境变量：ANDROID_HOME'})
    return
  }

  // 获取文件路径
  let filePath = vFilePath.value
  if (filePath === undefined || filePath == null || filePath.length === 0) {
    // dialog.showErrorBox("提示", "请上传文件")
    dialog.showMessageBox({type: 'error', title: '提示', message: '请选择文件'})
    return
  }

  // 获取文件扩展名
  let extension = _getFileExtension(filePath).toLowerCase()
  if (extension !== 'apk' && extension !== 'dex' && extension !== 'jar') {
    dialog.showMessageBox({type: 'error', title: '提示', message: '只支持apk、dex、jar文件'})
    return
  }

  if (progressing) {
    return
  }

  vCalcContainer.className = 'calc-button-container-disabled'
  vProgress.style.display = 'inline'
  progressing = true

  // 执行计算方法数的脚本
  if (extension === 'apk') {
    execCalcApkMethodCmd(androidHome, filePath)
  } else if (extension === 'dex') {
    execCalcDexMethodCmd(androidHome, filePath)
  } else if (extension === 'jar') {
    execCalcJarMethodCmd(androidHome, filePath)
  }
}

// 计算apk文件的方法数
function execCalcApkMethodCmd(androidHome, apkFilePath) {
  // 解压apk文件
  let configDir = remote.app.getPath('userData')
  let unzipDir = join(join(configDir, 'tmp'), new Date().getTime() + '')
  console.log(unzipDir)
  extract(apkFilePath, {dir: unzipDir}, function (err) {
    let files = fs.readdirSync(unzipDir)
    let reg = /(classes[0-9]*\.dex)/g

    let dexFiles = []
    files.forEach((val, index) => {
      if (reg.test(val)) {
        dexFiles.push(val)
      }

      if (index === files.length - 1) {
        _calcDexFile(androidHome, unzipDir, dexFiles, 0)
      }
    })
  })
}

function _calcDexFile(androidHome, unzipDir, dexFiles) {
  console.log(dexFiles)

  let methodCount = 0
  let fieldCount = 0
  let dexdumpPath = _getDexdumpPath(androidHome)
  dexFiles.forEach((val, index) => {
    let dexFilePath = join(unzipDir, val)
    let cmd = `"${dexdumpPath}" -f "${dexFilePath}" | grep -e method_ids_size -e field_ids_size`

    let stdout = _execCmd(cmd)
    stdout.trim().split('\n').forEach((v, i) => {
      v = v.replace(/\s*/g, '')

      // 方法数
      if (v.indexOf('method_ids_size') === 0) {
        methodCount += parseInt(v.substring('method_ids_size'.length + 1))
      }
      // 属性数
      else if (v.indexOf('field_ids_size') === 0) {
        fieldCount += parseInt(v.substring('field_ids_size'.length + 1))
      }

      if (index === dexFiles.length - 1) {
        progressing = false
        vCalcContainer.className = 'calc-button-container'
        vProgress.style.display = 'none'
        vMethodCount.innerText = `方法数：${methodCount}\n属性数：${fieldCount}`
      }
    })

  })
}

function _handleCalcResult(res) {
  let methodCount = 0
  let fieldCount = 0
  res.trim().split('\n').forEach((v, i) => {
    v = v.replace(/\s*/g, '')

    // 方法数
    if (v.indexOf('method_ids_size') === 0) {
      methodCount += parseInt(v.substring('method_ids_size'.length + 1))
    }
    // 属性数
    else if (v.indexOf('field_ids_size') === 0) {
      fieldCount += parseInt(v.substring('field_ids_size'.length + 1))
    }

    progressing = false
    vCalcContainer.className = 'calc-button-container'
    vProgress.style.display = 'none'
    vMethodCount.innerText = `方法数：${methodCount}\n属性数：${fieldCount}`
  })
}

// 计算dex文件的方法数
function execCalcDexMethodCmd(androidHome, dexFilePath) {
  dexFilePath = dexFilePath.replace(/\s*/g, '\ ')
  let stdout = _execCmd(_joinDexdumpCmd(androidHome, dexFilePath))
  _handleCalcResult(stdout)
}

// 计算jar文件的方法数
function execCalcJarMethodCmd(androidHome, jarFilePath) {
  let dxPath = join(_getBuildToolsPath(androidHome), 'dx')
  let outputPath = ''

  let toDexCmd = `"${dxPath}" --dex --verbose --no-strict --output="${outputPath}" "${jarFilePath}"`
  let stdout = _execCmd(toDexCmd)
  let res = _execCmd(_joinDexdumpCmd(androidHome, outputPath))
  _handleCalcResult(res)
}

function _execCmd(cmd) {
  try {
    let bytes = childProcess.execSync(cmd)
    return uint8ArrayToString(bytes)
  } catch (e) {
    vMethodCount.innerText = `Error: \n${e}`
  }
}

function uint8ArrayToString(fileData) {
  let dataString = "";
  for (let i = 0; i < fileData.length; i++) {
    dataString += String.fromCharCode(fileData[i]);
  }
  return dataString
}

function _joinDexdumpCmd(androidHome, filePath) {
  let dexdumpPath = _getDexdumpPath(androidHome)
  return `"${dexdumpPath}" -f "${filePath}" | grep -e method_ids_size -e field_ids_size`
}

// 获取文件的扩展名
function _getFileExtension(filePath) {
  let start = filePath.lastIndexOf('.')
  let extension = filePath.substring(start + 1, filePath.length)
  if (extension === undefined || extension == null) {
    return ''
  }
  return extension
}

function _getDexdumpPath(androidHome) {
  return join(_getBuildToolsPath(androidHome), 'dexdump')
}

// 获取build-tools的文件夹，根据版本号获取最大版本号的目录
function _getBuildToolsPath(androidHome) {
  let buildToolsPath = join(androidHome, 'build-tools')
  let dirs = fs.readdirSync(buildToolsPath)

  let dir = ''
  let dirVersion = {major: -1, minor: -1, minimal: -1}
  let reg = /([a-zA-Z])/g
  dirs.forEach((val, index) => {
    if (!reg.test(val)) {
      let index1 = val.indexOf('.')
      let index2 = val.lastIndexOf('.')
      let major = parseInt(val.substring(0, index1))
      let minor = parseInt(val.substring(index1 + 1, index2))
      let minimal = parseInt(val.substring(index2 + 1, val.length))
      if (major > dirVersion.major || minor > dirVersion.minor || minimal > dirVersion.minimal) {
        dir = val
        dirVersion = {major: major, minor: minor, minimal: minimal}
      }
    }
  })
  return join(buildToolsPath, dir)
}
