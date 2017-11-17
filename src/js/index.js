
const { ipcRenderer } = require('electron')
const path = require('path')
const { URL } = require('url')
const $ = jQuery = require('jquery')
const jsgrid = require('jsgrid')
const chartjs = require('chart.js')

const gridFields = [
  { name: "Year", type: "number", width: 50 },
  { name: "Event", type: "number", width: 50 },
  { name: "Pos", type: "number", width: 50 },
  { name: "Class", type: "text", wdith: 50 },
  { name: "Num", type: "number", width: 50 },
  { name: "Driver", type: "text", width: 100 },
  { name: "Vehicle", type: "text", width: 200 },
  { name: "Best", type: "number", width: 50 },
  { name: "Previous", type: "number", width: 50 },
  { name: "First", type: "number", width: 50 }
];

let currentGraph = null
let currentView = null

/*
 * View event handlers
 */
$(document).ready(() => {
  $("#toolbar_search_tool").click(() => {
    if (currentView.cssId === "graph_view") {
      ipcRenderer.send('open-graph-search')
    } else {
      ipcRenderer.send('open-grid-search')
    }
  });

  $("#toolbar_percent_tool").click(() => {
    ipcRenderer.send('show-view', 'percent-graph')
  });

  $("#toolbar_graph_tool").click(() => {
    ipcRenderer.send('show-view', 'overview-graph')
  });

  $("#toolbar_scatter_tool").click(() => {
    ipcRenderer.send('show-view', 'scatter-graph')
  });

  $("#toolbar_grid_tool").click(() => {
    ipcRenderer.send('show-view', 'data-grid')
  });
});

function updateToolbar(view) {
  switch (view.id) {
    case 'data-grid':
      $("#toolbar_percent_tool").removeClass("noshow")
      $("#toolbar_scatter_tool").removeClass("noshow")
      $("#toolbar_graph_tool").removeClass("noshow")
      $("#toolbar_search_tool").removeClass("noshow")
      $("#toolbar_grid_tool").addClass("noshow")
      break;

    case 'overview-graph':
      $("#toolbar_percent_tool").removeClass("noshow")
      $("#toolbar_scatter_tool").removeClass("noshow")
      $("#toolbar_grid_tool").removeClass("noshow")
      $("#toolbar_search_tool").removeClass("noshow")
      $("#toolbar_graph_tool").addClass("noshow")
      break;

    case 'scatter-graph':
      $("#toolbar_percent_tool").removeClass("noshow")
      $("#toolbar_graph_tool").removeClass("noshow")
      $("#toolbar_grid_tool").removeClass("noshow")
      $("#toolbar_search_tool").removeClass("noshow")
      $("#toolbar_scatter_tool").addClass("noshow")
      break;

    case 'percent-graph':
      $("#toolbar_scatter_tool").removeClass("noshow")
      $("#toolbar_graph_tool").removeClass("noshow")
      $("#toolbar_grid_tool").removeClass("noshow")
      $("#toolbar_search_tool").removeClass("noshow")
      $("#toolbar_percent_tool").addClass("noshow")
      break;

    default:
      console.log(`Uknown view ID: ` + view.id)
      break;
  }
}

/**
 * 
 * @param {*} element 
 * @param {*} items 
 */
function buildSearchOption(element, items) {
  let emptyOption = ['<option value="none"></option>']

  element.find('option').remove()
  options = emptyOption.concat(items.map((item) => { return `<option value="${item}">${item}</option>` }))
  element.html(options.join('\n'))
}

function resetSearchOptions(formId) {
  $(formId).find("input[type=text]").val("")
}

/**
 * 
 */
ipcRenderer.on('status-message', (event, message, area) => {
  var statusArea;
  switch (area) {
    case 'left':
      statusArea = $("#status_left")
      break;

    case 'middle':
      statusArea = $("#status_middle")
      break;

    case 'right':
      statusArea = $("#status_right")
      break;

    default:
      statusArea = $("#status-left")
  }

  statusArea.text(message)
})

ipcRenderer.on('show-view', (event, view) => {
  $(".view-content").addClass("noshow")
  $(view.cssId).removeClass("noshow")
  $(view.cssId).addClass("show")
  updateToolbar(view)
  currentView = view
});

//
// Grid View
//

ipcRenderer.on('show-grid-data', (event, data) => {
  $("#jsGrid").jsGrid({
    width: "100%",
    height: "100%",
    sorting: true,
    paging: true,
    data: data,
    fields: gridFields
  });
});

//
// Graph Views
//
function renderOverviewGraph(ctx, data) {
  currentGraph = new chartjs(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: "Max Times",
          fill: false,
          showLine: false,
          backgroundColor: 'rgb(255, 0, 0)',
          borderColor: 'rgb(255, 0, 0)',
          pointRadius: 4,
          data: data.maxTimes
        },
        {
          label: "Min Times",
          fill: false,
          showLine: false,
          backgroundColor: 'rgb(0, 153, 51)',
          borderColor: 'rgb(0, 153, 51)',
          pointRadius: 4,
          data: data.minTimes
        },
        {
          label: "Average Times",
          fill: false,
          showLine: false,
          backgroundColor: 'rgb(0, 0, 0)',
          borderColor: 'rgb(0, 0, 0)',
          pointRadius: 4,
          pointStyle: 'cross',
          data: data.avgTimes
        },
        {
          label: "Median Times",
          fill: false,
          showLine: false,
          backgroundColor: 'rgb(0, 0, 0)',
          borderColor: 'rgb(0, 0, 0)',
          pointRadius: 4,
          pointStyle: 'crossRot',
          data: data.medTimes
        },
        {
          label: "Driver Times",
          fill: false,
          showLine: false,
          backgroundColor: 'rgb(0, 102, 204)',
          borderColor: 'rgb(0, 102, 204)',
          pointRadius: 10,
          pointStyle: 'rectRot',
          data: data.drvTimes
        }
      ],
    },
    options: {
      title: {
        display: true,
        text: `Overview - ${data.driver}`
      }
    }
  });
}

function renderScatterGraph(ctx, data) {
  currentGraph = new chartjs(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        {
          type: 'bubble',
          label: 'Times',
          backgroundColor: 'rgb(0, 153, 51)',
          borderColor: 'rgb(0, 153, 51)',
          data: data.data
        }
      ],
    },
    options: {
      title: {
        display: true,
        text: `${data.scca_class} Times - ${data.driver}`
      },
      scales: {
        xAxes: [
          {
            type: 'category',
            position: 'bottom',
            labels: data.labels,
          }
        ]
      }
    }
  })
}

function renderPercentGraph(ctx, data) {
  currentGraph = new chartjs(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: '% of Best',
          backgroundColor: 'rgb(0, 102, 204)',
          borderColor: 'rgb(0, 102, 204)',
          data: data.data
        }
      ],
    },
    options: {
      title: {
        display: true,
        text: `% of Best ${data.scca_class} Times - ${data.driver}`
      }
    }
  })
}

ipcRenderer.on('show-graph', (event, id, data) => {
  let ctx = $("#graph_canvas")[0].getContext('2d')
  if (currentGraph !== null) {
    currentGraph.destroy()
    currentGraph = null
  }

  switch (id) {
    case 'overview-graph':
      renderOverviewGraph(ctx, data)
      break;
    case 'scatter-graph':
      renderScatterGraph(ctx, data)
      break;
    case 'percent-graph':
      renderPercentGraph(ctx, data)
      break;
    default:
      console.log("Unknow graph ID: " + id)
      break;
  }
});

//
// Search Dialog
//
ipcRenderer.on('reset-search-dialog', (event) => {
  resetSearchOptions("#search_form");
});

ipcRenderer.on('open-search-dialog', (event, years, events, classes, responseChannel) => {
  let dialog = $("#search_dialog").get(0)

  // Build the search options
  buildSearchOption($("#search_year_input"), years)
  buildSearchOption($("#search_event_input"), events)
  buildSearchOption($("#search_class_input"), classes)

  // Clear form input values
  //$("#search_form").find("input[type=text]").val("")
  
  // Cancel button handler
  $("#search_dialog_cancel").click(() => {
    // HACK: See below
    dialog.open = true
    dialog.close();
  });

  // Reset button handler
  $("#search_dialog_reset").click(() => {
    resetSearchOptions("#search_form");
  });

  // Search button handler
  $("#search_dialog_ok").click(() => {
    let response = {
      year: $("#search_year_input").val(),
      event: $("#search_event_input").val(),
      scca_class: $("#search_class_input").val(),
      vehicle: $("#search_vehicle_input").val(),
      driver: $("#search_driver_input").val(),
    };

    // HACK: Dialog close seems to get confused about the open attribute and thinks it's missing
    // causing a close error. Setting the open attribute explicity before the close seems to 
    // fix it.
    dialog.open = true
    dialog.close()
    //console.log(`Search dialog OK: year=${response.year}, event=${response.event}, class=${response.scca_class}, vehicle=${response.vehicle}, driver=${response.driver}`)
    ipcRenderer.send(responseChannel, response)
  });

  // Trigger a click on the OK button when enter is pressed
  $("#search_form").keyup((event) => {
    if (event.keyCode === 13) {
      $("#search_dialog_ok").click();
    }
  });

  dialog.showModal();
});

//
// Graph Search Dialog
//

ipcRenderer.on('reset-graph-search-dialog', (event) => {
  resetSearchOptions("#graph_search_form");
});

ipcRenderer.on('open-graph-search-dialog', (event, classes, responseChannel) => {
  let dialog = $("#graph_search_dialog").get(0)

  // Build the search options
  buildSearchOption($("#graph_search_class_input"), classes)

  // Cancel button handler
  $("#graph_search_dialog_cancel").click(() => {
    // HACK: See below
    dialog.open = true
    dialog.close();
  });

  // Reset button handler
  $("#graph_search_dialog_reset").click(() => {
    resetSearchOptions("#graph_search_form");
  });

  // Search button handler
  $("#graph_search_dialog_ok").click(() => {
    let response = {
      scca_class: $("#graph_search_class_input").val(),
      vehicle: $("#graph_search_vehicle_input").val(),
      driver: $("#graph_search_driver_input").val(),
    };

    // HACK: Dialog close seems to get confused about the open attribute and thinks it's missing
    // causing a close error. Setting the open attribute explicity before the close seems to 
    // fix it.
    dialog.open = true
    dialog.close()
    //console.log(`Search dialog OK: year=${response.year}, event=${response.event}, class=${response.scca_class}, vehicle=${response.vehicle}, driver=${response.driver}`)
    ipcRenderer.send(responseChannel, response)
  });

  // Trigger a click on the OK button when enter is pressed
  $("#graph_search_form").keyup((event) => {
    if (event.keyCode === 13) {
      $("#graph_search_dialog_ok").click();
    }
  });

  dialog.showModal();
});
