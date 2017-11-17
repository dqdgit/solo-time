//
// Include required modules
//
const { app, BrowserWindow, Menu, MenuItem, ipcMain, dialog, Tray } = require('electron')
const path = require('path')
const url = require('url')
const fs = require('fs')
const Sequelize = require('sequelize')

const datamodel = require('./datamodel')

// Initialize the data connection and data interface
const dbPath = path.join(__dirname, '../../db/soloview.sqlite');
const rawData = new datamodel(dbPath)

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWin
let mainContents
let lastGridRowCount = 0
let currentViewId

// Define the menu items
const template = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Import File...',
        click(item, focusWindow, event) {
          importFile();
        }
      },
      { type: 'separator' },
      { role: 'quit' }
    ]
  },
  {
    label: 'Data',
    submenu: [
      {
        label: 'Drop Data',
        click(item, focusWindow, event) {
          rawData.drop();
        }
      },
      {
        label: 'Reset Database',
        click(item, focusWindow, event) {
          rawData.reset();
        },
      }
    ]
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'Open Developer Tools',
        click(item, focusWindow, event) {
          mainWin.webContents.openDevTools()
        }
      },
      {
        label: 'About',
        click(item, focusWindow, event) {
          showAbout()
        }
      }
    ]
  },
  // {
  //   label: 'Test',
  //   submenu: [
  //     {
  //       label: 'Overview',
  //       click(item, focusWindow, event) {
  //         rawData.findOverviewData("david q. dunn", (response) => {
  //           console.log("Overview response: " + response);
  //         });
  //       }
  //     }
  //   ]
  // }
]

const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)

// Array of view information
const viewMap = [
  {
    id: 'data-grid',
    cssId: '#grid_view',
    name: 'Grid',
    sendChannel: 'grid-show',
    responseChannel: 'grid-response',
    searchResponseChannel: 'grid-search-response',
    render: renderGrid,
    defaultCriteria: {}
  },
  {
    id: 'overview-graph',
    cssId: '#graph_view',
    name: 'Overview',
    sendChannel: 'overview-show',
    responseChannel: 'overview-response',
    searchResponseChannel: 'overview-search-response',
    render: renderOverview,
    defaultCriteria: { driver: 'david dunn' }
  },
  {
    id: 'scatter-graph',
    cssId: '#graph_view',
    name: 'Class Scatter',
    sendChannel: 'scatter-show',
    responseChannel: 'scatter-response',
    searchResponseChannel: 'scatter-search-response',
    render: renderScatter,
    defaultCriteria: { driver: 'david dunn', scca_class: 'CAMC' }
  },
  {
    id: 'percent-graph',
    cssId: '#graph_view',
    name: 'Class Percent',
    sendChannel: 'percent-show',
    responseChannel: 'percent-response',
    searchResponseChannel: 'percent-search-response',
    render: renderPercent,
    defaultCriteria: { driver: 'david dunn', scca_class: 'CAMC'}
  }
]

/**
 * Create the main windows and set it's handlers
 */
function createMainWindow() {
  // Create the browser window.
  // Platform: process.platform
  //   o "darwin" - Mac
  //   o "win32" - Windows
  //   o "linux" - Linux

  //const appIcon = new Tray(path.join(__dirname, 's-2-1024.png'))

  // Create the window
  mainWin = new BrowserWindow({
    width: 1024,
    height: 800,
    show: false,
    backgroundColor: '#eeeeee',
    title: "Solo View",
    icon: path.join(__dirname, '../assets/traffic_cone_orange.png')
  })

  mainContents = mainWin.webContents

  // and load the index.html of the app.
  mainWin.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Emitted when the mainWindow is closed.
  mainWin.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })

  // After the window is ready show the grid view
  mainWin.once('ready-to-show', () => {
    mainWin.show()
    let view = findView('data-grid')
    showView(view.id, view.defaultCriteria)
  })
}

/**
 * This method will be called when Electron has finished
 * initialization and is ready to create browser windows.
 * Some APIs can only be used after this event occurs.
 */
app.on('ready', createMainWindow)

/**
 * Quit when all windows are closed.
 *
 * On macOS it is common for applications and their menu bar
 * to stay active until the user quits explicitly with Cmd + Q
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

/**
 * On macOS it's common to re-create a window in the app when the
 * dock icon is clicked and there are no other windows open.
 */
app.on('activate', () => {
  if (mainWin === null) {
    createWindow()
  }
})

function findView(viewId) {
  return viewMap.find((item) => {
    return (item.id === viewId)
  })
}

/**
 * Dispay the given message on the application status bar in the 
 * specified area.
 * 
 * @param {String} message - the message to be displayed
 * @param {String} area - the status bar area in which the
 *                        message is to be displayed ("left",
 *                        "middle", "right")
 */
function statusMessage(message, area) {
  mainContents.send('status-message', message, area)
}

/**
 * Display the about message box
 */
function showAbout() {
  dialog.showMessageBox({
    type: "info",
    title: "About Solo View",
    message: `Version ${app.getVersion()}`,
    buttons: ["OK"]
  })
}

/**
 * Display the system open dialog and allow the user to select
 * zero or more SVG files to be loaded.
 */
function importFile() {
  dialog.showOpenDialog({
    filters: [{ name: 'csv', extensions: ['csv'] }],
    properties: ['openFile']
  },
  function (filePaths) {
    if (filePaths !== undefined) {
      let numLoaded = 0
      for (let filePath of filePaths) {
        numLoaded += loadFileData(filePath)
      }

      rawData.findAll(processDataRecords, dataError)
      statusMessage(`Loaded: ${numLoaded}`, "left")
    }
  });
}

/**
 * Load the raw STL Solo data from the CSV files specified by the given path
 * 
 * @param {String} filePath - Full path to CSV file to load
 */
function loadFileData(filePath) {
  try {
    lines = fs.readFileSync(filePath, 'utf8').split("\n")
    // Assume the first line contains the headings
    rawData.appendLines(lines.slice(1, lines.length - 1))
    return lines.length - 1
  } catch (err) {
    console.log("ERROR: " + err)
    return -1
  }
}

/**
 * Handle search dialog results from the client
 */
ipcMain.on('grid-search-response', (event, criteria) => {
  //rawData.search(response, processDataRecords);
  renderGrid(criteria)
});

ipcMain.on('overview-search-response', (event, criteria) => {
  //console.log(`Search response: class=${response.scca_class}, vehicle=${response.vehicle}, driver=${response.driver}`)
  //rawData.findOverviewData(response, processOverviewResponse)
  renderOverview(criteria)
});

ipcMain.on('view-search-criteria', (event, viewId, criteria) => {
  let view = findView(viewId)
  view.render(criteria)
});

ipcMain.on('open-grid-search', (event) => {
  showSearchDialog();
});

ipcMain.on('show-view', (event, viewId) => {
  let view = findView(viewId)
  showView(view.id, view.defaultCriteria)
});

ipcMain.on('open-graph-search', (event) => {
  showGraphSearchDialog();
});

/**
 * Callback for Sequelize query results (aka fullfilled Promise)
 * 
 * @param {Array} records - array of data records from Sequelize
 */
function processDataRecords(records) {
  let data = records.map(record => (
    {
      "Year": record.year,
      "Event": record.event,
      "Pos": record.pos,
      "Class": record.scca_class,
      "Num": record.num,
      "Driver": record.driver,
      "Vehicle": record.model,
      "Best": record.raw_time,
      "Previous": record.diff,
      "First": record.from_first
    }
  ));
  lastGridRowCount = data.length
  mainContents.send('show-grid-data', data)
  showCount()
}

function renderGrid(criteria) {
  if (criteria === null) {
    rawData.findAll(processDataRecords, dataError)
  } else {
    rawData.search(criteria, processDataRecords);
  }
}

function renderOverview(criteria) {
  rawData.findOverviewData(criteria, (response) => {
    //mainContents.send("show-overview-graph", response)
    mainContents.send('show-graph', 'overview-graph', response)    
  })
}

function renderScatter(criteria) {
  rawData.findScatterData(criteria, (response) => {
    //mainContents.send("show-scatter-graph", response);
    mainContents.send('show-graph', 'scatter-graph', response)
  })
}

function renderPercent(criteria) {
  rawData.findPercentData(criteria, (response) => {
    mainContents.send('show-graph', 'percent-graph', response)
  })
}

/**
 * Callback for Sequelize errors (aka rejected Promise)
 * 
 * @param {Object} err  - Error object from Sequelize
 */
function dataError(err) {
  console.log("ERROR: " + err);
}

/**
 * Display the current number of records in the database in the status bar.
 */
function showCount() {
  rawData.count(function (count) {
    statusMessage(`Total records: ${count}`, "right");
    statusMessage(`Showing ${lastGridRowCount} of ${count}`, "middle");
  });  
}

function showView(viewId, criteria) {
  let view = findView(viewId)
  mainContents.send("show-view", view)
  view.render(criteria)
  currentViewId = view.id
}

/**
 * 
 */
function showSearchDialog() {
  let view = findView('data-grid')
  rawData.findSearchOptions((response) => {
    mainContents.send(
      "open-search-dialog", 
      response.years, 
      response.events, 
      response.classes,
      view.searchResponseChannel
    )
  });
}

function showGraphSearchDialog() {
  let view = findView('overview-graph')
  rawData.findSearchOptions((response) => {
    mainContents.send(
      "open-graph-search-dialog",
      response.classes,
      view.searchResponseChannel
    )
  });  
}