
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
        year: parseInt(values[0]),
        event: parseInt(values[1]),
        pos: parseInt(values[2]),
        scca_class: values[3],
        num: parseInt(values[4]),
        driver: values[5],
        model: values[6],
        raw_time: parseFloat(values[7]),
        diff: parseFloat(values[8]),
        from_first: parseFloat(values[9])        
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
        order: ['year', 'event', 'pos']
      })
    ]

    Promise.all(promises).then((results) => {
      response.data = results[0].map((item) => {
        return {
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
        attributes: ['year', 'event'],
        where: whereClause,
        group: ['year', 'event'],
        order: ['year', 'event']
      }),
      this.dataModel.findAll({
        attributes: ['driver', 'year', 'event', 'raw_time'],
        where: whereClause,
        order: ['year', 'event']
      })
    ]

    Promise.all(promises).then((results) => {
      // Create a working array with just the necessary fields
      let records = results[1].map((item) => {
        return {
          driver: item.driver,
          year: item.year,
          event: item.event,
          raw_time: item.raw_time
        }
      })

      // Compose the labels for the time axis
      response.labels = results[0].map((item) => { return `${item.year - 2000}.${item.event}` })

      // Calculate the event stats
      let events = results[0].map((item) => { return { year: item.year, event: item.event } })
      events.forEach((event) => {
        // Extract the just the raw times for this year/event pair
        let values = records.filter((item) => {
          return (item.year === event.year && item.event === event.event)
        }).map((item) => {
          return item.raw_time
        })

        // Find min and max
        response.minTimes.push(Math.min(...values))
        response.maxTimes.push(Math.max(...values))

        // Compute average
        let sum = values.reduce((prev, curr) => { return curr += prev })
        response.avgTimes.push(sum / values.length)

        // Compute median
        values.sort((a, b) => { return a - b })
        let low = Math.floor((values.length - 1) / 2)
        let high = Math.ceil((values.length - 1) / 2)
        response.medTimes.push((values[low] + values[high]) / 2)

        // Extract the times for the specified driver
        let drvTimes = records.filter((item) => {
          return (item.year === event.year && item.event === event.event)
        }).map((item) => {
          return { driver: item.driver, raw_time: item.raw_time }
        })

        let names = response.driver.split(' ')
        let driverRegExp = new RegExp(`^${names[0]}.*${names[names.length - 1]}`, 'i')
        let drvTime = drvTimes.find((item) => {
          return (driverRegExp.test(item.driver))
        })

        if (drvTime != undefined) {
          response.drvTimes.push(drvTime.raw_time)
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
        attributes: ['driver', 'year', 'event', 'model', 'raw_time'],
        where: whereClause,
        order: ['year', 'event']
      }),
      this.dataModel.findAll({
        attributes: ['year', 'event'],
        where: whereClause,
        group: ['year', 'event'],
        order: ['year', 'event']
      }),
    ]

    Promise.all(promises).then((results) => {
      // Extract the time data
      let names = response.driver.split(' ')
      let driverRegExp = new RegExp(`^${names[0]}.*${names[names.length - 1]}`, 'i')
      response.data = results[0].map((item) => {
        return {
          x: (item.year - 2000) + (item.event / 100.0),
          y: item.raw_time,
          r: driverRegExp.test(item.driver) ? 4 : 2,
          driver: item.driver,
          vehicle: item.model
        }
      })

      response.backgroundColor = results[0].map((item) => {
        return (driverRegExp.test(item.driver) ? '#0066ff' : '#009933');
      })

      // Extract the label data
      response.labels = results[1].map((item) => {
        return ((item.year - 2000) + (item.event / 100.0));
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
        attributes: ['year', 'event'],
        where: whereClause,
        group: ['year', 'event'],
        order: ['year', 'event']
      }),
      this.dataModel.findAll({
        attributes: ['driver', 'year', 'event', 'raw_time'],
        where: whereClause,
        order: ['year', 'event']
      })
    ]

    Promise.all(promises).then((results) => {
      // Create a working array with just the necessary fields
      let records = results[1].map((item) => {
        return {
          driver: item.driver,
          year: item.year,
          event: item.event,
          raw_time: item.raw_time
        }
      })

      // Compose the labels for the time axis
      response.labels = results[0].map((item) => { return `${item.year - 2000}.${item.event}` })

      // Calculate the event data
      let events = results[0].map((item) => { return { year: item.year, event: item.event } })
      events.forEach((event) => {
        // Extract the just the raw times for this year/event pair
        let values = records.filter((item) => {
          return (item.year === event.year && item.event === event.event)
        }).map((item) => {
          return item.raw_time
        })

        // Find the best time
        let bestTime = Math.min(...values)

        // Extract the times for the specified driver
        let names = response.driver.split(' ')
        let driverRegExp = new RegExp(`^${names[0]}.*${names[names.length - 1]}`, 'i')
        let drvTime = records.filter((item) => {
          return (item.year === event.year && item.event === event.event)
        }).map((item) => {
          return { driver: item.driver, raw_time: item.raw_time }
        }).find((item) => {
          return (driverRegExp.test(item.driver))
        })

        if (drvTime != undefined) {
          response.data.push((1.0 - (drvTime.raw_time / bestTime)) * -100.0)
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
