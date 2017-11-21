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
let mainWin                 // Electron main browser window reference
let mainContents            // Electron web contents event emitter
let lastGridRowCount = 0    // Current number of total data records
//let currentViewId           // View map identifier for the currently active view

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
    searchChannel: 'grid-search-dialog',
    queryChannel: 'grid-query-dialog',
    queryResponseChannel: 'query-response',
    render: renderGrid,
    defaultCriteria: {}
  },
  {
    id: 'overview-graph',
    cssId: '#graph_view',
    name: 'Overview',
    sendChannel: 'overview-show',
    responseChannel: 'overview-response',
    searchChannel: 'graph-search-dialog',
    searchResponseChannel: 'overview-search-response',
    queryChannel: null,
    queryResponseChannel: null,
    render: renderOverview,
    defaultCriteria: { driver: 'david dunn' }
  },
  {
    id: 'scatter-graph',
    cssId: '#graph_view',
    name: 'Class Scatter',
    sendChannel: 'scatter-show',
    responseChannel: 'scatter-response',
    searchChannel: 'graph-search-dialog',
    searchResponseChannel: 'scatter-search-response',
    queryChannel: null,
    queryResponseChannel: null,
    render: renderScatter,
    defaultCriteria: { driver: 'david dunn', scca_class: 'CAMC' }
  },
  {
    id: 'percent-graph',
    cssId: '#graph_view',
    name: 'Class Percent',
    sendChannel: 'percent-show',
    responseChannel: 'percent-response',
    searchChannel: 'graph-search-dialog',
    searchResponseChannel: 'percent-search-response',
    queryChannel: null,
    queryResponseChannel: null,
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

/**
 * Return the view object from viewMap for the specified identifier
 * 
 * @param {String} viewId - identifier of one of the views defined in viewMap
 */
function findView(viewId) {
  return viewMap.find((item) => {
    return (item.id === viewId)
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

      renderGrid(null)
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
 * Client message handlers
 */
ipcMain.on('grid-search-response', (event, criteria) => {
  renderGrid(criteria)
});

ipcMain.on('overview-search-response', (event, criteria) => {
  renderOverview(criteria)
});

ipcMain.on('query-response', (event, criteria) => {
  console.log("Query Response")
})

ipcMain.on('view-search-criteria', (event, viewId, criteria) => {
  let view = findView(viewId)
  view.render(criteria)
});

ipcMain.on('show-view', (event, viewId) => {
  let view = findView(viewId)
  showView(view.id, view.defaultCriteria)
});

ipcMain.on('open-search', (event, viewId) => {
  let view = findView(viewId)
  rawData.findSearchOptions((response) => {
    mainContents.send(
      view.searchChannel,
      response.years,
      response.events,
      response.classes,
      view.searchResponseChannel
    )
  });  
})

ipcMain.on('open-query', (event, viewId) => {
  let view = findView(viewId)
  mainContents.send(view.queryChannel, view.queryResponseChannel)
})

/**
 * Render the data grid using the specified search criteria
 * 
 * @param {Object} criteria - object containing the search parameters
 */
function renderGrid(criteria) {
  rawData.findGridData(criteria, (response) => {
    mainContents.send('show-grid-data', response.data)
    lastGridRowCount = response.data.length
    updateStatus()
  })
}

/**
 * Render the overview graph using the specified search criteria
 * 
 * @param {Object} criteria - object containing the search parameters
 */
function renderOverview(criteria) {
  rawData.findOverviewData(criteria, (response) => {
    mainContents.send('show-graph', 'overview-graph', response)    
  })
}

/**
 * Render the scattre graph using the specified search criteria
 * 
 * @param {Object} criteria - object containing the search parameters
 */
function renderScatter(criteria) {
  rawData.findScatterData(criteria, (response) => {
    mainContents.send('show-graph', 'scatter-graph', response)
  })
}

/**
 * Render the percent from best graph using the specified search criteria
 * 
 * @param {Object} criteria - object containing the search parameters
 */
function renderPercent(criteria) {
  rawData.findPercentData(criteria, (response) => {
    mainContents.send('show-graph', 'percent-graph', response)
  })
}

/**
 * Update the status bar with context specific information
 */
function updateStatus() {
  rawData.count(function (count) {
    statusMessage(`Total records: ${count}`, "right");
    statusMessage(`Showing ${lastGridRowCount} of ${count}`, "middle");
  });  
}

/**
 * Update and display the specified view using the given search criteria
 * 
 * @param {String} viewId - identifier of a veiw defined in the view map
 * @param {Object} criteria - object containing the search parameters
 */
function showView(viewId, criteria) {
  let view = findView(viewId)
  mainContents.send("show-view", view)
  view.render(criteria)
  //currentViewId = view.id
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
