
const Sequelize = require('sequelize')
const Op = Sequelize.Op
const QueryTypes = Sequelize.QueryTypes

class DataModel {
  constructor(dbFilePath) {
    this.dataPath = dbFilePath;

    this.dataConnection = new Sequelize(null, null, null, {
      dialect: 'sqlite',
      storage: this.dataPath
    });

    this.dataModel = this.dataConnection.define('raw_data', {
      org: { type: Sequelize.STRING },
      date: { type: Sequelize.STRING },
      year: { type: Sequelize.INTEGER },
      event: { type: Sequelize.INTEGER },
      pos: { type: Sequelize.INTEGER },
      scca_class: { type: Sequelize.STRING },
      num: { type: Sequelize.INTEGER },
      driver: { type: Sequelize.STRING },
      model: { type: Sequelize.STRING },
      raw_time: { type: Sequelize.REAL },
      diff: { type: Sequelize.REAL },
      from_first: { type: Sequelize.REAL }
    });
  }

  get connection() {
    return this.dataConnection;
  }

  create() {
    this.dataModel.sync({ force: true })
  }

  drop() {
    this.dataConnection.drop();
  }
  
  reset() {
    this.dataConnection.drop();
    this.create();
  }

  /**
   * 
   * @param {Array} lines 
   */
  appendLines(lines) {
    let records = lines.map((line) => {
      let values = line.split('\t')
      return {
        org: values[0],
        date: values[1],
        year: parseInt(values[2]),
        event: parseInt(values[3]),
        pos: parseInt(values[4]),
        scca_class: values[5],
        num: parseInt(values[6]),
        driver: values[7],
        model: values[8],
        raw_time: parseFloat(values[9]),
        diff: parseFloat(values[10]),
        from_first: parseFloat(values[11])        
      }
    });

    try {
      this.dataModel.bulkCreate(records);
    } catch(err) {
      console.log("ERROR: " + err);
    }
  }

  /**
   * 
   * @param {Function} onFullfilled 
   */
  count(onFullfilled) {
    this.dataModel.count().then(onFullfilled);
  }

  /**
   * 
   * @param {Object} terms 
   * @param {Function} onFullfilled 
   */
  search(terms, onFullfilled) {
    let whereClause = this._getSearchTerms(terms)
    this.dataModel.findAll({where: whereClause}).then(onFullfilled);
  }

  /**
   * 
   * @param {Function} onFullfilled 
   */
  findAll(onFullfilled) {
    this.dataModel.findAll({ 
      order: ['year', 'event'] 
    }).then(onFullfilled);
  }

  /**
   * 
   * @param {Function} onFullfilled 
   */
  findSearchOptions(onFullfilled) {
    let promises = [
      this.dataModel.aggregate('year', 'DISTINCT', { plain: false, order: ['year'] }),
      this.dataModel.aggregate('event', 'DISTINCT', { plain: false, order: ['event'] }),
      this.dataModel.aggregate('scca_class', 'DISTINCT', { plain: false, order: ['scca_class'] })
    ];

    Promise.all(promises).then((results) => {
      let response = {
        years: [],
        events: [],
        classes: []
      }

      response.years = results[0].map((item) => {return item.DISTINCT})
      response.events = results[1].map((item) => {return item.DISTINCT})
      response.classes = results[2].map((item) => {return item.DISTINCT})

      onFullfilled(response)
    });
  }

  /**
   * 
   * @param {*} terms 
   * @param {*} onFullfilled 
   */
  findGridData(terms, onFullfilled) {
    let thisCriteria = this._cloneObject(terms)
    let response = {
      data: []
    }

    //delete thisCriteria.driver
    let whereClause = this._getSearchTerms(thisCriteria)
  
    let promises = [
      this.dataModel.findAll({
        where: whereClause,
        order: ['date', 'raw_time']
      })
    ]

    Promise.all(promises).then((results) => {
      response.data = results[0].map((item) => {
        return {
          "Org": item.org,
          "Date": item.date,
          "Year": item.year,
          "Event": item.event,
          "Pos": item.pos,
          "Class": item.scca_class,
          "Num": item.num,
          "Driver": item.driver,
          "Vehicle": item.model,
          "Best": item.raw_time,
          "Previous": item.diff,
          "First": item.from_first
        }
      });

      onFullfilled(response)
    });
  }

  /**
   * 
   * @param {Object} terms 
   * @param {Function} onFullfilled 
   */
  findOverviewData(terms, onFullfilled) {
    // TODO: This method is pretty big. Maybe refactor it?
    let thisCriteria = this._cloneObject(terms)
    let response = {
      driver: thisCriteria.driver || 'david dunn',
      labels: [],
      minTimes: [],
      maxTimes: [],
      avgTimes: [],
      medTimes: [],
      drvTimes: []
    }

    delete thisCriteria.driver
    let whereClause = this._getSearchTerms(thisCriteria)

    let promises = [
      this.dataModel.findAll({
        attributes: ['date'],
        where: whereClause,
        group: ['date'],
        order: ['date']
      }),
      this.dataModel.findAll({
        attributes: ['org', 'date', 'driver', 'year', 'event', 'model', 'scca_class', 'raw_time'],
        where: whereClause,
        order: ['date']
      })
    ]

    Promise.all(promises).then((results) => {
      // Create a working array with just the necessary fields
      let records = results[1].map((item) => {
        return {
          org: item.org,
          date: item.date,
          driver: item.driver,
          year: item.year,
          event: item.event,
          model: item.model,
          scca_class: item.scca_class,
          raw_time: item.raw_time
        }
      })

      // Compose the labels for the time axis
      response.labels = results[0].map((item) => { 
        return item.date
      })

      // Calculate the event stats
      let events = results[0].map((item) => { return item.date })
      events.forEach((event) => {
        let xValue = event

        // Extract the data for this year/event pair
        let values = records.filter((item) => {
          return (item.date === event)
        }).map((item) => {
          return {
            org: item.org,
            event: item.event,
            driver: item.driver,
            model: item.model,
            scca_class: item.scca_class,
            raw_time: item.raw_time
          }
        })

        let raw_times = values.map((item) => {
          return item.raw_time;
        })

        // Find min and max values
        let minValue = values.reduce((min, p) => {
          return (p.raw_time < min.raw_time) ? p : min;
        })
        response.minTimes.push({ 
          x: xValue, 
          y: minValue.raw_time, 
          driver: minValue.driver,
          scca_class: minValue.scca_class,
          vehicle: minValue.model,
          org: minValue.org,
          event: minValue.event
        })

        let maxValue = values.reduce((max, p) => {
          return (p.raw_time > max.raw_time) ? p : max;
        })
        response.maxTimes.push({
          x: xValue,
          y: maxValue.raw_time,
          driver: maxValue.driver,
          scca_class: maxValue.scca_class,
          vehicle: maxValue.model,
          org: maxValue.org,
          event: maxValue.event
        })

        // Compute average
        let sum = raw_times.reduce((prev, curr) => { return curr += prev })
        response.avgTimes.push({
          x: xValue,
          y: sum / raw_times.length
        })

        // Compute median
        raw_times.sort((a, b) => { return a - b })
        let low = Math.floor((raw_times.length - 1) / 2)
        let high = Math.ceil((raw_times.length - 1) / 2)
        response.medTimes.push((raw_times[low] + raw_times[high]) / 2)

        // Extract the times for the specified driver
        let names = response.driver.split(' ')
        let driverRegExp = new RegExp(`^${names[0]}.*${names[names.length - 1]}`, 'i')
        let drvTime = values.find((item) => {
          return (driverRegExp.test(item.driver))
        })

        if (drvTime != undefined) {
          response.drvTimes.push({
            x: xValue,
            y: drvTime.raw_time,
            driver: drvTime.driver,
            scca_class: drvTime.scca_class,
            vehicle: drvTime.model,
            org: drvTime.org,
            event: drvTime.event
          })
        } else {
          response.drvTimes.push(null)
        }
      })

      onFullfilled(response)
    });
  }

  /**
   * 
   * @param {Object} terms 
   * @param {Function} onFullfilled 
   */
  findScatterData(terms, onFullfilled) {
    let thisCriteria = this._cloneObject(terms)
    let response = {
      driver: thisCriteria.driver || 'david dunn',
      scca_class: thisCriteria.scca_class,
      labels: [],
      data: [],
      backgroundColor: []
    }

    delete thisCriteria.driver
    let whereClause = this._getSearchTerms(thisCriteria)

    let promises = [
      this.dataModel.findAll({
        attributes: ['org', 'date', 'driver', 'year', 'event', 'model', 'raw_time'],
        where: whereClause,
        order: ['date']
      }),
      this.dataModel.findAll({
        attributes: ['date'],
        where: whereClause,
        group: ['date'],
        order: ['date']
      }),
    ]

    Promise.all(promises).then((results) => {
      // Extract the time data
      let names = response.driver.split(' ')
      let driverRegExp = new RegExp(`^${names[0]}.*${names[names.length - 1]}`, 'i')
      response.data = results[0].map((item) => {
        return {
          x: item.date,
          y: item.raw_time,
          r: driverRegExp.test(item.driver) ? 4 : 2,
          driver: item.driver,
          vehicle: item.model,
          org: item.org,
          event: item.event,
          date: item.date
        }
      })

      response.backgroundColor = results[0].map((item) => {
        return (driverRegExp.test(item.driver) ? '#0066ff' : '#009933');
      })

      // Extract the label data
      response.labels = results[1].map((item) => {
        return item.date;
      })

      onFullfilled(response)
    });    
  }

  /**
   * 
   * @param {Object} terms 
   * @param {Function} onFullfilled 
   */
  findPercentData(terms, onFullfilled) {
    let thisCriteria = this._cloneObject(terms)
    let response = {
      driver: thisCriteria.driver || 'david dunn',
      scca_class: thisCriteria.scca_class,
      labels: [],
      data: []
    }

    delete thisCriteria.driver
    let whereClause = this._getSearchTerms(thisCriteria)

    let promises = [
      this.dataModel.findAll({
        attributes: ['date'],
        where: whereClause,
        group: ['date'],
        order: ['date']
      }),
      this.dataModel.findAll({
        attributes: ['org', 'date', 'driver', 'year', 'event', 'model', 'scca_class', 'raw_time'],
        where: whereClause,
        order: ['date']
      })
    ]

    Promise.all(promises).then((results) => {
      // Create a working array with just the necessary fields
      let records = results[1].map((item) => {
        return {
          org: item.org,
          date: item.date,
          driver: item.driver,
          year: item.year,
          event: item.event,
          model: item.model,
          scca_class: item.scca_class,
          raw_time: item.raw_time
        }
      })

      // Compose the labels for the time axis
      response.labels = results[0].map((item) => { 
        return item.date
      })

      // Calculate the event data
      let events = results[0].map((item) => { return item.date })
      events.forEach((event) => {
        let xValue = event

        // Extract the data for this year/event pair
        let values = records.filter((item) => {
          return (item.date === event)
        }).map((item) => {
          return {
            org: item.org,
            date: item.date,
            event: item.event,
            driver: item.driver,
            model: item.model,
            scca_class: item.scca_class,
            raw_time: item.raw_time
          }
        })

        // Find the best time
        //let bestTime = Math.min(...values)
        let minValue = values.reduce((min, p) => {
          return (p.raw_time < min.raw_time) ? p : min;
        })
        let bestTime = minValue.raw_time

        // Extract the times for the specified driver
        let names = response.driver.split(' ')
        let driverRegExp = new RegExp(`^${names[0]}.*${names[names.length - 1]}`, 'i')
        let drvTime = records.filter((item) => {
          return (item.date === event)
        }).map((item) => {
          return { 
            org: item.org,
            date: item.date,
            event: item.event,
            driver: item.driver, 
            model: item.model,
            scca_class: item.scca_class,
            raw_time: item.raw_time 
          }
        }).find((item) => {
          return (driverRegExp.test(item.driver))
        })

        if (drvTime != undefined) {
          //response.data.push((1.0 - (drvTime.raw_time / bestTime)) * -100.0)
          response.data.push({
            x: xValue,
            y: (1.0 - (drvTime.raw_time / bestTime)) * -100.0,
            driver: drvTime.driver,
            scca_class: drvTime.scca_class,
            vehicle: drvTime.model,
            org: drvTime.org,
            event: drvTime.event
          })
        } else {
          response.data.push(null)
        }
      })

      onFullfilled(response)
    });
  }

  /**
   * 
   * @param {Object} obj 
   */
  _cloneObject(obj) {
    return JSON.parse(JSON.stringify(obj))
  }

  /**
   * 
   * @param {Object} terms 
   */
  _getSearchTerms(terms) {
    let likeTerms = ["driver", "vehicle"]
    let whereClause = {}

    for (let prop in terms) {
      let value = terms[prop]
      if (value && value !== "" && value !== "none") {
        if (likeTerms.indexOf(prop) > -1) {
          // NOTE: Sqlite does not support ILIKE. However LIKE appears to case insensitive
          let key = (prop === 'vehicle') ? 'model' : prop
          //whereClause[(prop === "vehicle") ? "model" : prop] = { [Op.like]: `%${value}%` }
          //value = '%' + value.replace(' ', '%') + '%'
          whereClause[key] = { [Op.like]: '%' + value.replace(' ', '%') + '%' }
        } else {
          whereClause[prop] = value
        }
      }
    }
    
    return whereClause
  }
}

module.exports = DataModel;
