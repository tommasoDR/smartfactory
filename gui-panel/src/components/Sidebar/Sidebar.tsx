import React, {useCallback, useEffect, useState} from 'react';
import SidebarSection from './SidebarSection';
import {DashboardFolder, DashboardLayout} from "../../api/DataStructures";
import {SidebarItemProps} from "./SidebarItem";
import PersistentDataManager from "../../api/DataManager";

export const pointIcon: string = 'https://cdn.builder.io/api/v1/image/assets/TEMP/e4f31bc08d7f9cce9aa4820b2adc97643d3b0c001526273b80178ee6bf890b69?placeholderIfAbsent=true&apiKey=346cd8710f5247b5a829262d8409a130';
export const folderIcon: string = "/icons/folder.svg";
const DashboardSidebar: React.FC = () => {

    const [dataManagerVersion, setDataManagerVersion] = useState(0);
    let dataManager = PersistentDataManager.getInstance();

    // State for the new folder form
    const [isFormVisible, setFormVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const handleAddFolder = () => {
        if (newFolderName.trim()) {
            // Check if the folder name exists
            if (dataManager.findDashboardFolderByName(newFolderName)) {
                console.error('Folder already exists:', newFolderName);
                // Show an error message
                setErrorMessage('Folder already exists');
                return;
            }
            // Add the new folder at data manager level
            dataManager.addDashboardFolder(newFolderName);
            console.log('Folder name: ', newFolderName);
            setNewFolderName('');
            setErrorMessage('');
            setFormVisible(false); // Hide the form after adding
        }
    };

    useEffect(() => {
        // Refresh the data manager when a change occurs
        const refresh = () => setDataManagerVersion(prevVersion => prevVersion + 1);

        // Subscribe to changes
        dataManager.subscribe(refresh);

        // Cleanup on unmount
        return () => dataManager.unsubscribe(refresh);
    }, []);

    const sectionsItems = [
        /*
        {
            icon: '/icons/user.svg',
            text: 'User Settings',
            path: '/user-settings'
        },
         */
        {icon: '/icons/kpi.svg', text: 'KPIs', path: '/kpis'},
        {
            icon: 'https://cdn.builder.io/api/v1/image/assets/TEMP/a71c21e7b5dfbcb7b600377b94bb0ba6e150f444fca7a9c978d6d84a0e3b8cea?placeholderIfAbsent=true&apiKey=346cd8710f5247b5a829262d8409a130',
            text: 'Data View',
            path: '/data-view'
        },
        {
            icon: '/icons/log.svg',
            text: 'Reports',
            path: '/reports'
        },
        {
            icon: '/icons/log.svg',
            text: 'Log',
            path: '/log'
        },
        /*{
            icon: 'https://cdn.builder.io/api/v1/image/assets/TEMP/0d48c9f5dfc5a5a35e09f99f937cac2777cbffd55ad9387fca9e140c2b0bc70f?placeholderIfAbsent=true&apiKey=346cd8710f5247b5a829262d8409a130',
            text: 'Production Lines',
            path: '/production-lines'
        },
         */
        {icon: '/icons/forecast.svg', text: 'Forecasting', path: '/forecasts'},
    ];

    const formatDashboards = useCallback(
        (folders: (DashboardFolder | DashboardLayout)[]): SidebarItemProps[] => {
            const formatted: SidebarItemProps[] = [];

            folders.forEach((content) => {
                let currentPath = `/dashboards/${content.id}`;

                if (content instanceof DashboardLayout) {
                    // Add pointer (endpoint) items
                    formatted.push({
                        text: content.name,
                        path: `${currentPath}`,
                        icon: pointIcon,
                        folder: false,
                    });
                } else {
                    // Add the folder item with its children
                    formatted.push({
                        text: content.name,
                        path: currentPath,
                        icon: folderIcon,
                        folder: true,
                        children: content.children.map((child) => {
                            if (child instanceof DashboardFolder) {
                                // Process nested folders
                                return {
                                    text: child.name,
                                    path: `${currentPath}/${child.id}`,
                                    icon: folderIcon,
                                    folder: true,
                                    children: formatDashboards([child]), // Recursive children formatting
                                };
                            } else {
                                // Add pointer (endpoint) items
                                return {
                                    text: child.name,
                                    path: `${currentPath}/${child.id}`,
                                    icon: pointIcon,
                                    folder: false,
                                };
                            }
                        }),
                    });
                }
            });

            return formatted;
        },
        [] // Add dependencies here, if any are needed
    );

    useEffect(() => {
        const fetchDashboards = async () => {
            try {
                // Format the data for the sidebar
                const formattedDashboards = formatDashboards(dataManager.getDashboards());
                console.log('Fetching dashboards:', formattedDashboards);
                setDashboards(formattedDashboards);
            } catch (error) {
                console.error('Failed to fetch dashboards:', error);
            }
        };

        fetchDashboards();
    }, [dataManagerVersion]);

    useEffect(() => {
        // set loading and refresh the local dataManager
        console.log('Refreshing data manager...');
        dataManager = PersistentDataManager.getInstance();
    }, [dataManagerVersion]);


    const [dashboardsItems, setDashboards] = useState<
        SidebarItemProps[]
    >([]);

    return (
        <aside className="bg-white border-r border-gray-200 flex flex-col items-center w-fit h-screen p-3">
            {/* Company Logo */}
            <div className="flex justify-center items-center mb-4">
                <img
                    src={require('./icons/logo.svg').default}
                    alt="Company Logo"
                    className="w-36 h-auto"
                />
            </div>

            {/* Sidebar Sections */}
            {/* <SidebarSection title="Favorites" items={favoritesItems}/> */}
            <SidebarSection title="Sections" items={sectionsItems}/>
            {/* Dashboards Section */}
            {/* Form for Adding a New Dashboard Folder */}
            {!isFormVisible && (
                <div className="w-full flex justify-center mt-2">
                    <button
                        onClick={() => setFormVisible(true)}
                        className="w-10 h-10 flex items-center justify-center bg-blue-500 text-white rounded-full shadow-md hover:bg-blue-600 transition-transform transform hover:scale-105"
                        aria-label="Create New Folder"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 4v16m8-8H4"
                            />
                        </svg>
                    </button>
                </div>
            )}

            {isFormVisible && (
                <div className="w-full mt-4 flex flex-col items-center">
                    <input
                        type="text"
                        placeholder="Name of the Folder"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        className="border rounded w-full p-2 mb-2"
                    />
                    {errorMessage && (
                        <p className="text-red-500 text-sm mb-2">{errorMessage}</p>
                    )}
                    <div className="flex space-x-4">
                        <button
                            onClick={handleAddFolder}
                            className="bg-blue-500 text-white p-2 rounded-full shadow-md hover:bg-blue-600 transition-transform transform hover:scale-105"
                            aria-label="Create Folder"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 4v16m8-8H4"
                                />
                            </svg>
                        </button>
                        <button
                            onClick={() => {
                                setFormVisible(false);
                                setNewFolderName('');
                                setErrorMessage('');
                            }}
                            className="bg-red-500 text-white p-2 rounded-full shadow-md hover:bg-red-600 transition-transform transform hover:scale-105"
                            aria-label="Cancel"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            <SidebarSection title="Dashboard" items={dashboardsItems} />
        </aside>
    );
};

export default DashboardSidebar;
