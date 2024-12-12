import PersistentDataManager from "./PersistentDataManager";
import {KPI, Machine} from "./DataStructures";
import {Filter} from "../components/Selectors/FilterOptions";
import {TimeFrame} from "../components/Selectors/TimeSelect";
import {calculateKPIValue, getHistoricalData, KPIRequest} from "./ApiService";

const dataManager = PersistentDataManager.getInstance();
const smoothData = (data: number[], alpha: number = 0.3): number[] => {
    const ema = [];
    ema[0] = data[0]; // Start with the first data point
    for (let i = 1; i < data.length; i++) {
        ema[i] = (alpha * data[i] + (1 - alpha) * ema[i - 1]); // Exponential smoothing
    }
    return ema;
};

function createTimeSegments(timeFrame: TimeFrame, timeUnit: string, timePeriods: string[]) {
    let startDate = new Date(timeFrame.from);
    if (timeUnit === 'hour') {
        // Split data by hours if the time frame is a single day
        for (let i = 0; i < timeFrame.to.getHours(); i++) {
            startDate.setHours(i, 0, 0, 0); // set to the hour of the day
            timePeriods.push(startDate.toISOString());
        }
    } else if (timeUnit === 'day') {
        // Split by days for week/month timeframes
        const endDate = timeFrame.to;
        while (startDate <= endDate) {
            timePeriods.push(startDate.toISOString());
            startDate.setDate(startDate.getDate() + 1);
        }
    } else if (timeUnit === 'week') {
        const endDate = timeFrame.to;
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            timePeriods.push(currentDate.toISOString());
            currentDate.setDate(currentDate.getDate() + 7); // Increment by 7 days for each week
        }
    } else if (timeUnit === 'month') {
        const endDate = timeFrame.to;
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            timePeriods.push(currentDate.toISOString());
            currentDate.setMonth(currentDate.getMonth() + 1); // Increment by 1 month
        }
    }
}

export const simulateChartData = async (
    kpi: KPI,
    timeFrame: TimeFrame,
    type: string = "line",
    filters?: Filter
): Promise<any[]> => {
    console.log("Fetching data with:", {kpi, timeFrame, type, filters});

    // Call the fetchData function to get the data based on the selected KPI, time frame, and filters
    console.log(fetchData(kpi, timeFrame, type, filters));

    const unfilteredData = dataManager.getMachineList();
    let filteredData: Machine[];
    // Apply filters
    if (filters && filters.machineIds?.length) {
        filteredData = unfilteredData.filter((data) =>
            filters.machineIds?.includes(data.machineId)
        );
    } else if (filters && filters.machineType !== "All") {
        // Filter by machineType only if no machineIds are provided
        filteredData = unfilteredData.filter((data) => data.type === filters.machineType);
    } else {
        // Fetch all data when no filters are applied
        filteredData = unfilteredData
    }
    const timePeriods: string[] = [];

    const timeUnit = timeFrame.aggregation || getTimePeriodUnit(timeFrame);

    createTimeSegments(timeFrame, timeUnit, timePeriods);

    switch (type) {
        case "line":
        case "scatter":
        case 'area': // Generate time-series data with applied filters
            // Default aggregation to 'hour' if not specified
            return timePeriods.map((period, index) => {
                const entry: any = {timestamp: period};

                // Simulate raw data
                const rawData = filteredData.map(() => Math.random() * 50);

                // Apply smoothing to the randomly generated data
                const smoothedData = smoothData(rawData);

                filteredData.forEach((machine, idx) => {
                    entry[machine.machineId] = smoothedData[idx]; // Apply smoothed values
                });

                return entry;
            });
        case "barv":
        case "barh":
        case "pie":
            // Generate categorical data
            return filteredData.map((data) => ({
                name: data.machineId,
                value: Math.round(Math.random() * 100),
            }));

        case "donut":
            // Generate categorical data, and add the total for the donut chart
            const donutData = filteredData.map((data) => ({
                name: data.machineId,
                value: Math.round(Math.random() * 100),
            }));
            donutData.push({name: "Total", value: donutData.reduce((acc, cur) => acc + cur.value, 0)});
            return donutData;

        case "stacked_bar":
            // Generate periods based on the timeframe
            return timePeriods.map((period) => {
                const entry: any = {timestamp: period};
                filteredData.forEach((machine) => {
                    entry[machine.machineId] = Math.round(Math.random() * 100); // Random value for each machine
                });
                return entry;
            });

        case "hist":
            // Generate histogram bins using sturges's formula
            const binSize = Math.ceil(Math.log2(filteredData.length) + 1);
            return Array.from({length: 10}, (_, i) => ({
                bin: `${i * binSize}-${(i + 1) * binSize}`,
                value: Math.round(Math.random() * 50),
            }));

        default:
            throw new Error(`Unsupported chart type: ${type}`);
    }
};


// Function to get time unit (hours, days, months) based on TimeFrame's `from` and `to` values
const getTimePeriodUnit = (timeFrame: TimeFrame): string => {
    const diffTime = timeFrame.to.getTime() - timeFrame.from.getTime(); // Difference in milliseconds
    const diffDays = diffTime / (1000 * 3600 * 24); // Convert to days

    if (diffDays < 1) {
        return 'hours'; // If less than a day, group by hours
    } else if (diffDays < 7) {
        return 'days'; // If within a week, group by days
    } else if (diffDays < 60) {
        return 'days'; // If within a month, group by days
    } else {
        return 'months'; // If more than a month, group by months
    }
};

//////////////////////// END OF MOCK DATA GENERATOR ///////////////////////////

/**
 * Function to fetch data based on the selected KPI, time frame, and filters
 * KPIS that do not have an aggregation method valid for the historical endpoint are deferred to the calculation endpoint
 * @param kpi - KPI object
 * @param timeFrame - TimeFrame object, composed of the start and end dates
 * @param type - Chart type, to identify if the chart requires time series data
 * @param filters - Filter object containing machine IDs
 */
async function fetchData(
    kpi: KPI,
    timeFrame: TimeFrame,
    type: string,
    filters?: Filter
): Promise<any[]> {

    // check if the kpi id contains an aggregation method valid for the historical endpoint
    // if not, defer the request to the calculation endpoint
    const aggregationMethods = ['avg', 'sum', 'min', 'max'];
    const isTimeSeries = type === "line" || type === "scatter" || type === "area";

    // check if the last 3 characters of the kpi id are an aggregation method
    const kpiId = kpi.id;
    const aggregationMethod = kpiId.substring(kpiId.length - 3);

    let data: any;

    if (!aggregationMethods.includes(aggregationMethod)) {
        // if the aggregation method is not found, request calculation
        const request = requestCalculation(isTimeSeries, kpi, timeFrame, filters);

        const response = await calculateKPIValue(request);

        // if it's a time series, we need to rearrange the data.
        // grouping the timestamps so that we get something like
        // {timestamp: '2024-12-02', machine1: 20, machine2: 30}
        // from a series of objects like {Start_Date: '2024-12-02', Machine_Name:machine_1, Value: 20}

        if (isTimeSeries) {
            data = response.reduce((acc: any, cur: any) => {
                const timestamp = cur.Date_Start;
                const machine = cur.Machine_Name;
                const value = cur.Value;

                if (!acc[timestamp]) {
                    acc[timestamp] = {};
                }
                acc[timestamp][machine] = value;
                return acc;
            }, {});
        } else {
            // if it's categorical data, we can just return a reformatted version of the response
            // format like {name: 'machine1', value: 20}

            data = response.map((entry: any) => {
                return {
                    name: entry.Machine_Name,
                    value: entry.Value,
                };
            });
        }

    } else {
        // if the aggregation method is found, request historical data
        const query = constructQuery(isTimeSeries, kpi, timeFrame, filters);
        // Send the query to the historical data endpoint
        data = await getHistoricalData(query.toString());

        // if it's a time series, we need to rearrange the data.
        // grouping the timestamps so that we get something like
        // {timestamp: '2024-12-02', machine1: 20, machine2: 30}
        // from a series of objects like {timestamp: '2024-12-02', machine1: 20}

        if (isTimeSeries) {
            data = data.reduce((acc: any, cur: any) => {
                const timestamp = cur.timeframe;
                const machine = cur.name;
                const value = cur[kpi.id];

                if (!acc[timestamp]) {
                    acc[timestamp] = {};
                }
                acc[timestamp][machine] = value;
                return acc;
            }, {});
        } else {
            // if it's categorical data, we can just return a reformatted version of the response
            // format like {name: 'machine1', value: 20}
            data = data.map((entry: any) => {
                return {
                    name: entry.name,
                    value: entry[kpi.id],
                };
            });
        }
    }

    return data;
}


/**
 * Function to construct a JSON query object based on the selected graph type, KPI, timeframe, and filters to send to the historical data endpoint.
 * @param isTimeSeries - Boolean flag to determine if the chart needs a time series
 * @param kpi - KPI object
 * @param timeFrame - TimeFrame composed of the start and end dates
 * @param filters - Filter object
 */
const constructQuery = (
    isTimeSeries: boolean,
    kpi: KPI,
    timeFrame: TimeFrame,
    filters?: Filter
): object => {
    // Get the list of machines from filters or default to all available
    const machineList: string[] = filters?.machineIds
        ? filters.machineIds
        : dataManager.getMachineList().map(machine => machine.machineId);

    const timeFrameCopy: TimeFrame = {
        from: new Date(timeFrame.from),
        to: new Date(timeFrame.to),
        aggregation: timeFrame.aggregation,
    }
    // set the month of the timeframe to be betweeen 3 and 10, try to keep the same difference if possible
    const diff = timeFrame.to.getMonth() - timeFrame.from.getMonth();
    timeFrameCopy.from.setMonth(3);
    timeFrameCopy.to.setMonth(Math.min(3 + diff, 10));

    timeFrame = timeFrameCopy;
    // Format dates to `yyyy-mm-dd`
    const from: string = timeFrame.from.toISOString().split('T')[0];
    const to: string = timeFrame.to.toISOString().split('T')[0];

    // Dynamically determine time grouping based on duration
    let timeGrouping: string | null; // Default to day
    // for categorical type graphs, don't use time grouping
    if (isTimeSeries) {
        // Calculate the duration of the timeframe in days
        const durationInDays = Math.ceil(
            (timeFrame.to.getTime() - timeFrame.from.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (durationInDays <= 1) {
            timeGrouping = "P1H"; // For a single day, group by hour
        } else if (durationInDays <= 31) {
            timeGrouping = "P1D"; // For up to a month, group by day
        } else if (durationInDays <= 91) {
            timeGrouping = "P1W"; // For up to three months, group by week
        } else {
            timeGrouping = "P1M"; // For periods longer than a year, group by year
        }
    } else {
        timeGrouping = null;
    }

    // Construct the query JSON
    return {
        kpi: kpi.id, // Use the KPI ID
        timeframe: {
            start_date: from,
            end_date: to,
        },
        machines: machineList, // List of machine IDs
        group_by: timeGrouping, // Grouping logic
    };
};

/**
 * Function to request calculation of a KPI based on the selected time frame and filters
 * @param isTimeSeries - Boolean flag to determine if the chart needs a time series
 * @param kpi - KPI object
 * @param timeFrame - TimeFrame object
 * @param filters - Filter object
 */
function requestCalculation(isTimeSeries: boolean, kpi: KPI, timeFrame: TimeFrame, filters?: Filter): KPIRequest[] {

    /* Request format for calculation endpoint
    {
        "Date_Start": "2024-12-02",
        "Date_Finish": "2024-12-08",
        "Machine_Name": "Assembly Machine 3",
        "KPI_Name": "offline_time_avg"
    }*/
    const machineList: string[] = filters?.machineIds
        ? filters.machineIds
        : dataManager.getMachineList().map(machine => machine.machineId);

    if (isTimeSeries) {
        // Request time series data
        // For each machine, request the KPI calculation on the kpi over a period of time
        // Based on the length of the full time period, split it into smaller periods
        // For each period, request the calculation

        const timePeriods: string[] = [];
        const timeUnit = timeFrame.aggregation || getTimePeriodUnit(timeFrame);
        createTimeSegments(timeFrame, timeUnit, timePeriods);

        return timePeriods.map((period) => {
            return machineList.map((machine) => {
                return {
                    Date_Start: period,
                    Date_Finish: period,
                    Machine_Name: machine,
                    KPI_Name: kpi.id,
                }
            })
        }).flat();

    }
    // for categorical data, request the calculation for the full time period for each machine

    return machineList.map((machine) => {
        return {
            Date_Start: timeFrame.from.toISOString().split('T')[0],
            Date_Finish: timeFrame.to.toISOString().split('T')[0],
            Machine_Name: machine,
            KPI_Name: kpi.id,
        }
    });
}


/**
 * Function to convert a JSON query object to a SQL query string for testing
 * @param query - JSON query object
 */

const convertJsonToSql = (query: any): string => {
    // Destructure the query object
    const {kpi, timeframe, machines, group_by} = query;

    const getKpiAndAggregationMethod = (kpi: string) => {
        // Define the list of known aggregation methods
        const aggregationMethods = ['avg', 'sum', 'max'];

        // Check if the kpi ends with one of the aggregation methods
        for (const method of aggregationMethods) {
            if (kpi.endsWith(`_${method}`)) {
                // If it ends with one of the aggregation methods, split at the last underscore
                const kpiName = kpi.substring(0, kpi.lastIndexOf(`_${method}`));
                return {kpiName, aggMethod: method};
            }
        }

        // If no aggregation method is found, return the kpi as is and undefined for aggMethod
        return {kpiName: kpi, aggMethod: undefined};
    };

    const {kpiName, aggMethod} = getKpiAndAggregationMethod(kpi);

    // Base SELECT statement
    let sql = `SELECT `;

    // Add time grouping if specified
    if (group_by.time) {
        sql += `DATE_TRUNC('${group_by.time}', __time) AS time_period, `;
    }

    // Add grouping by machine name
    sql += `name, `;


    // Add aggregation field with alias (e.g., consumption_avg -> consumption_avg)
    if (aggMethod) {
        sql += `SUM("${aggMethod}") AS ${kpi}`;
    }

    // FROM clause
    sql += ` FROM "timeseries"`;

    // WHERE conditions
    const whereConditions = [];
    if (timeframe.start_date && timeframe.end_date) {
        whereConditions.push(
            `__time BETWEEN '${timeframe.start_date}' AND '${timeframe.end_date}'`
        );
    }
    if (machines && machines.length > 0) {
        whereConditions.push(`name IN ('${machines.join("', '")}')`);
    }
    if (kpi) {
        whereConditions.push(`kpi = '${kpiName || ""}'`);
    }

    if (whereConditions.length > 0) {
        sql += ` WHERE ` + whereConditions.join(" AND ");
    }

    // GROUP BY clause
    const groupByFields = [];
    if (group_by) {
        groupByFields.push(`DATE_TRUNC('${group_by}', __time)`);
    }

    groupByFields.push(group_by.category);

    if (groupByFields.length > 0) {
        sql += ` GROUP BY ` + groupByFields.join(", ") + `, name`;
    }

    // Add ORDER BY clause for time series
    if (group_by.time) {
        sql += ` ORDER BY time_period`;
    }

    // Return the constructed SQL query
    return sql;
};
