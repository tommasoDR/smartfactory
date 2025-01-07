import {useLocation} from "react-router-dom";
import {DashboardEntry, DashboardFolder, DashboardLayout, KPI} from "../../api/DataStructures";
import React, {useEffect, useState} from "react";
import Chart from "../Chart/Chart";
import {fetchData} from "../../api/DataFetcher";
import FilterOptionsV2, {Filter} from "../Selectors/FilterOptions";
import TimeSelector, {TimeFrame} from "../Selectors/TimeSelect";
import PersistentDataManager from "../../api/DataManager";
import {handleTimeAdjustments} from "../../utils/chartUtil";

class TemporaryLayout {

    charts: DashboardEntry[]

    constructor(charts: DashboardEntry[]) {
        this.charts = charts;
    }

    // add decoding from Chat
    static fromChat(json: Record<string, any>): TemporaryLayout {
        // the json received is a list of json DashboardEntry objects to decode with the DashboardEntry.decodeChat
        console.log(json);

        const entries: DashboardEntry[] = json.map((entry: Record<string, any>) => DashboardEntry.decodeChat(entry));
        return new TemporaryLayout(entries);
    }

    /**
     * This method saves the layout to a DashboardLayout object
     * @param layout TemporaryLayout - the layout to be saved
     * @param name string - the name of the layout
     * @returns DashboardLayout - the layout to be saved
     */
    static saveToLayout(layout: TemporaryLayout, name: string): DashboardLayout {
        return new DashboardLayout(name.trim().toLowerCase(), name, layout.charts);
    }

}

interface AIDashboardProps {
    userId: string
    agentRequest: (request: string) => void;
    currentRequest: string;
}

const AIDashboard: React.FC<AIDashboardProps> = ({userId, agentRequest, currentRequest}) => {
    const location = useLocation();
    const metadata = location.state?.metadata;

    const dataManager = PersistentDataManager.getInstance();
    const [dashboardData, setDashboardData] = useState<TemporaryLayout>(new TemporaryLayout([]));
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [chartData, setChartData] = useState<any[][]>([]);
    const kpiList = dataManager.getKpiList(); // Cache KPI list once
    const [filters, setFilters] = useState(new Filter("All", []));
    const [timeFrame, setTimeFrame] = useState<TimeFrame>({
        from: new Date(2024, 9, 16),
        to: new Date(2024, 9, 19),
        aggregation: 'day'
    });
    const [temporaryName, setTemporaryName] = useState<string>("");
    const [temporaryFolder, setTemporaryFolder] = useState<string>("");
    const [selectedFolder, setSelectedFolder] = useState<string>("new");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isRollbackTime, setIsRollbackTime] = useState(false);

    // Set the user ID for the API calls
    dataManager.setUserId(userId);

    //on first data load
    useEffect(() => {
        const fetchDashboardDataAndCharts = async () => {
            try {
                setLoading(true);
                setFilters(new Filter("All", [])); // Reset filters

                // Convert metadata into json
                const json = JSON.parse(metadata);

                // Fetch dashboard data by id
                let dash = TemporaryLayout.fromChat(json);

                setDashboardData(dash);

                let timeframe = handleTimeAdjustments(timeFrame, isRollbackTime);

                // Fetch chart data for each view
                const chartDataPromises = dash.charts.map(async (entry: DashboardEntry) => {
                    const kpi = kpiList.find(k => k.id === entry.kpi);
                    if (!kpi) {
                        console.error(`KPI with ID ${entry.kpi} not found.`);
                        return [];
                    }
                    return await fetchData(kpi, timeframe, entry.graph_type, undefined); // Add appropriate filters
                });

                const resolvedChartData = await Promise.all(chartDataPromises).catch(
                    (error) => {
                        console.error("Error fetching chart data:", error);
                        return [];
                    }
                );
                setChartData(resolvedChartData);
            } catch (error) {
                console.error("Error fetching dashboard or chart data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardDataAndCharts();
    }, [metadata, kpiList]);

    useEffect(() => {
        const fetchChartData = async () => {
            // Ensure promises are created dynamically based on latest dependencies
            const chartDataPromises = dashboardData.charts.map(async (entry: DashboardEntry) => {
                const kpi = kpiList.find(k => k.id === entry.kpi);
                if (!kpi) {
                    console.error(`KPI with ID ${entry.kpi} not found.`);
                    return [];
                }
                let timeframe = handleTimeAdjustments(timeFrame, isRollbackTime);
                return await fetchData(kpi, timeframe, entry.graph_type, filters); // Add appropriate filters
            });
            setRefreshing(true);
            try {
                const resolvedChartData = await Promise.all(chartDataPromises);
                setChartData(resolvedChartData);
            } catch (error) {
                console.error("Error fetching chart data:", error);
            } finally {
                setRefreshing(false);
            }
        };

        // Avoid fetching during initial loading
        if (!loading) {
            fetchChartData();
        }
    }, [filters, timeFrame, isRollbackTime]);

    // AI Chat Assistant Chart Explanation
    const handleExplain = (chart: string, kpi:KPI, data:any[]) => {
        let request: {[key: string]: string} = {};
        // Request type is explainChart
        request["type"] = "explainChart";
        // Add KPI details
        request["kpi_id"] = kpi.id;
        request["kpi_name"] = kpi.name;
        request["kpi_description"] = kpi.description;
        request["kpi_unit"] = kpi.unit;
        // Add chart details
        request["chart"] = chart;
        // Add data
        request["data"] = JSON.stringify(data);
        // Send request to AI in JSON format
        agentRequest(JSON.stringify(request));
    };


    if (loading) {
        return <div className="flex flex-col justify-center items-center h-screen">
            <div className="text-lg text-gray-600">Loading...</div>
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-gray-500"></div>
        </div>
    }
    return <div className="p-8 space-y-8 bg-gray-50 min-h-screen">
        {/* Disclaimer */}
        <p className="text-base text-gray-500">This is dashboard layout was created with the help of our AI. It will
            need
            to be recreated if not
            saved.</p>

        <div className="flex gap-5 w-fit h-fit">
            {/* Input field for giving the dashboard a name*/}
            <input
                type="text"
                placeholder="Dashboard Name"
                className="flex-grow p-2 border border-gray-200 rounded-lg"
                onBlur={(e) => setTemporaryName(e.target.value)}
            />
            {/*Add select for choose the Dashboard folder where to save it*/}
            <select
                className="flex-grow p-2 border border-gray-200 rounded-lg"
                onChange={(e) => setSelectedFolder(e.target.value)}
            >
                <option value="new">Create New Folder</option>
                {dataManager.getDashboardFolders().map((folder) => (
                    <option key={folder.id} value={folder.name}>
                        {folder.name}
                    </option>
                ))}
            </select>
            {/* Add an input to create a new folder, if CreateNewFolder */}
            {selectedFolder === "new" && (
                <input
                    type="text"
                    placeholder="Folder Name"
                    className="flex-grow p-2 border border-gray-200 rounded-lg"
                    onBlur={(e) => setTemporaryFolder(e.target.value)}
                />
            )}
            {/* Save button */}
            <button
                className="w-fit p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                onClick={
                    async () => {

                        // set the dashboard id to a unique id
                        const dashboardTemporaryId = dataManager.getUniqueDashboardId(temporaryName.trim().toLowerCase());

                        let dashboardFolder;
                        if (selectedFolder) {
                            if (selectedFolder === "new") {
                                // Create a new dashboard folder named temporaryFolder
                                dashboardFolder = new DashboardFolder(temporaryFolder.trim().toLowerCase(), temporaryFolder, []);
                            } else {
                                dashboardFolder = dataManager.findDashboardFolderByName(selectedFolder)
                            }
                        }
                        // Check if the dashboard pointer is null
                        if (!dashboardFolder) {
                            console.error("Dashboard folder not found");
                            setErrorMessage("Dashboard folder not found");
                            return;
                        }
                        // Create a new dashboard layout with (name, id, charts)
                        await dataManager.addDashboard(TemporaryLayout.saveToLayout(dashboardData, temporaryName), dashboardFolder);
                        //
                        console.log("Dashboard saved with name:", temporaryName + " and id: " + dashboardTemporaryId);
                    }
                }
            >
                Save Dashboard
            </button>
            {errorMessage && (
                <p className="text-red-500 text-sm mb-2">{errorMessage}</p>
            )}
        </div>

        <h1 className="text-3xl font-extrabold text-center text-gray-800">{temporaryName}</h1>
        <div className="flex space-x-4">
            <div><FilterOptionsV2 filter={filters} onChange={setFilters}/></div>
            <div><TimeSelector timeFrame={timeFrame} setTimeFrame={setTimeFrame}/></div>
            <div>
                <label htmlFor="timeRollback" className="text-gray-700">Back to last data available</label>
                <input
                    type="checkbox"
                    id="timeRollback"
                    name="timeRollback"
                    checked={isRollbackTime}
                    onChange={() => setIsRollbackTime(!isRollbackTime)}
                    className="ml-2"
                />
            </div>
        </div>
        {/* Refreshing indicator */}
        {refreshing && (
            <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex justify-center items-center">
                <div className="flex flex-col items-center bg-white p-8 rounded-lg shadow-lg">
                    <div className="text-lg text-gray-800 mb-4">Updating Charts...</div>
                    <div
                        className="flex justify-center items-center animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-gray-500"></div>
                </div>
            </div>
        )}
        {/* Grid Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 items-center w-f">
            {dashboardData.charts.map((entry: DashboardEntry, index: number) => {
                let kpi = kpiList.find(k => k.id === entry.kpi);
                if (!kpi) {
                    console.error(`KPI with ID ${entry.kpi} not found.`);
                    return null;
                }

                // Determine grid layout based on chart type
                const isSmallCard = entry.graph_type === 'pie' || entry.graph_type === 'donut';

                // Dynamic grid class
                const gridClass = isSmallCard
                    ? 'sm:col-span-1 lg:col-span-1' // Small cards fit three in a row
                    : 'col-span-auto '; // Bar and Pie charts share rows;

                return <div
                    key={index}
                    className={`bg-white shadow-lg rounded-xl p-6 border border-gray-200 hover:shadow-xl transition-shadow ${gridClass}`}
                >
                    {/* KPI Title and Explain Button */}
                    <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-semibold text-gray-700 text-center">
                                {kpi?.name}
                            </h3>
                            {chartData[index]?.length > 0 && (
                                <button
                                    className={`px-6 py-2 rounded shadow transition ${
                                        currentRequest != '' 
                                            ? 'bg-gray-200 text-gray-600 cursor-not-allowed' 
                                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                                    }`}
                                    onClick={() => handleExplain(entry.graph_type, kpi as KPI, chartData[index])}
                                    disabled={currentRequest != ''} // Disable the button when there is a current request
                                >
                                    Explain
                                </button>
                            )}
                        </div>

                    {/* Chart */}
                    <div className="flex items-center justify-center">
                        <Chart
                            data={chartData[index]} // Pass the fetched chart data
                            graphType={entry.graph_type}
                            kpi={kpi}
                            timeUnit={timeFrame.aggregation}
                        />
                    </div>
                </div>;
            })}
        </div>
        <p className="text-base">Note: While the layout is AI-generated from your prompt, data is fetched from the
            database.</p>
    </div>;
};

export default AIDashboard;
