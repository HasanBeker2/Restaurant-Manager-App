import React, { useState, useEffect } from 'react';
import Layout from './Layout';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

type TabType = 'rawGoods' | 'finishedProducts' | 'sales' | 'purchases';

interface CostHistoryDashboardProps {
  logo: string;
  restaurantName: string;
}

interface FilterOptions {
  dateRange: {
    startDate: Date | null;
    endDate: Date | null;
  };
  selectedItem: string;
  changeThreshold: number;
  selectedGraph: string | null; // Single selection
  selectedStatuses: string[];
}

interface ChartData {
  name: string; // Date
  salesPrice?: number; // From 'salesPrice'
  totalCost?: number; // From 'totalCost'
  profitPercentagePerItem?: number; // From 'profitPercentagePerItem'
  value?: number; // For rawGoods
  unit: string;
  fill?: string;
}

const CostHistoryDashboard: React.FC<CostHistoryDashboardProps> = ({ logo, restaurantName }) => {
  const [activeTab, setActiveTab] = useState<TabType>('rawGoods');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLoggedIn, setUserLoggedIn] = useState<boolean | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    dateRange: {
      startDate: new Date(new Date().setDate(new Date().getDate() - 30)),
      endDate: new Date(),
    },
    selectedItem: '',
    changeThreshold: 0,
    selectedGraph: null, // Initialize with no graph selected
    selectedStatuses: ['Paid'], // Default status for Sales tab
  });

  // Lists for dropdown selections
  const [rawGoodsList, setRawGoodsList] = useState<string[]>([]);
  const [finishedProductsList, setFinishedProductsList] = useState<string[]>([]);

  // Color palette for Raw Goods
  const colorPalette = [
    '#8884d8', '#82ca9d', '#ffc658', '#ff8042',
    '#8dd1e1', '#a4de6c', '#d0ed57', '#ffc0cb',
    '#ff7f50', '#d2691e'
  ];

  // Unit scaling mapping
  const unitScaling: { [key: string]: { factor: number, display: string } } = {
    'milliliters': { factor: 1000, display: 'L' },
    'ml': { factor: 1000, display: 'L' },
    'liters': { factor: 1, display: 'L' },
    'l': { factor: 1, display: 'L' },
    'grams': { factor: 1000, display: 'kg' },
    'g': { factor: 1000, display: 'kg' },
    'kilograms': { factor: 1, display: 'kg' },
    'kg': { factor: 1, display: 'kg' },
    // Add more units as needed
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserLoggedIn(true);
      } else {
        setUserLoggedIn(false);
        setLoading(false);
        setError("No user logged in. Please log in to view trends.");
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;

    const fetchItemLists = async () => {
      try {
        // Fetch Raw Goods
        const rawGoodsRef = collection(db, 'rawGoods');
        const rawGoodsQuery = query(rawGoodsRef, where('userId', '==', auth.currentUser.uid));
        const rawGoodsSnapshot = await getDocs(rawGoodsQuery);
        const rawGoods = rawGoodsSnapshot.docs.map(doc => doc.data().name);
        setRawGoodsList(rawGoods);

        // Fetch Finished Products
        const finishedProductsRef = collection(db, 'bomAssemblies');
        const finishedProductsQuery = query(finishedProductsRef, where('userId', '==', auth.currentUser.uid));
        const finishedProductsSnapshot = await getDocs(finishedProductsQuery);
        const finishedProducts = finishedProductsSnapshot.docs.map(doc => doc.data().finishedProductName);
        setFinishedProductsList(finishedProducts);
      } catch (error) {
        console.error('Error fetching items lists:', error);
        setError('Failed to fetch items data');
      }
    };

    fetchItemLists();
  }, [auth.currentUser]);

  const fetchAndProcessData = async () => {
    if (!auth.currentUser) return;

    setLoading(true);
    try {
      let collectionName = '';
      let dataProcessor: (data: any[]) => ChartData[];

      switch (activeTab) {
        case 'rawGoods':
          collectionName = 'rawGoods';
          dataProcessor = processRawGoodsData;
          break;
        case 'finishedProducts':
          collectionName = 'bomAssemblies';
          dataProcessor = processFinishedProductsData;
          break;
        case 'sales':
          collectionName = 'salesOrders';
          dataProcessor = processSalesData;
          break;
        case 'purchases':
          collectionName = 'purchaseOrders';
          dataProcessor = processPurchaseData;
          break;
      }

      const ref = collection(db, collectionName);
      const q = query(ref, where('userId', '==', auth.currentUser.uid));
      const snapshot = await getDocs(q);
      const rawData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date
      }));

      let filteredData = rawData;

      // Apply date filtering only if not in rawGoods tab
      if (activeTab !== 'rawGoods') {
        filteredData = rawData.filter(item => {
          const itemDate = new Date(item.date);
          return (!filterOptions.dateRange.startDate || itemDate >= filterOptions.dateRange.startDate) &&
                 (!filterOptions.dateRange.endDate || itemDate <= filterOptions.dateRange.endDate);
        });
      }

      // Process data based on active tab
      const processedData = dataProcessor(filteredData);
      setChartData(processedData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to fetch data');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAndProcessData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filterOptions, auth.currentUser]);

  const processRawGoodsData = (data: any[]): ChartData[] => {
    const processedData: ChartData[] = [];

    if (activeTab === 'rawGoods') {
      if (filterOptions.selectedGraph === 'QuantityOnHand') {
        if (filterOptions.selectedItem) {
          // For selected item, display Quantity On Hand
          const itemData = data.find(item => item.name === filterOptions.selectedItem);
          if (itemData) {
            let scaledQty = itemData.qtyOnHand;
            let unit = itemData.unitOfMeasure;

            if (unit.toLowerCase() === 'liters' || unit.toLowerCase() === 'milliliters') {
              scaledQty = itemData.qtyOnHand / 1000; // Convert ml to liters
              unit = 'L';
            } else if (unit.toLowerCase() === 'kilograms' || unit.toLowerCase() === 'grams') {
              scaledQty = itemData.qtyOnHand / 1000; // Convert grams to kilograms
              unit = 'kg';
            }

            processedData.push({
              name: itemData.name,
              value: parseFloat(scaledQty.toFixed(2)),
              unit: unit,
              fill: colorPalette[rawGoodsList.indexOf(itemData.name) % colorPalette.length]
            });
          }
        } else {
          // For all items, display Quantity On Hand
          data.forEach((item, index) => {
            let scaledQty = item.qtyOnHand;
            let unit = item.unitOfMeasure;

            if (unit.toLowerCase() === 'liters' || unit.toLowerCase() === 'milliliters') {
              scaledQty = item.qtyOnHand / 1000; // Convert ml to liters
              unit = 'L';
            } else if (unit.toLowerCase() === 'kilograms' || unit.toLowerCase() === 'grams') {
              scaledQty = item.qtyOnHand / 1000; // Convert grams to kilograms
              unit = 'kg';
            }

            processedData.push({
              name: item.name,
              value: parseFloat(scaledQty.toFixed(2)),
              unit: unit,
              fill: colorPalette[index % colorPalette.length]
            });
          });
        }
      } else if (filterOptions.selectedGraph === 'AverageCostOfUOM') {
        if (filterOptions.selectedItem) {
          // For selected item, display Average Cost of UOM
          const itemData = data.find(item => item.name === filterOptions.selectedItem);
          if (itemData) {
            processedData.push({
              name: itemData.name,
              value: itemData.averageCostOfUnitOfMeasure, // No rounding
              unit: '€',
              fill: colorPalette[rawGoodsList.indexOf(itemData.name) % colorPalette.length]
            });
          }
        } else {
          // For all items, display Average Cost of UOM
          data.forEach((item, index) => {
            processedData.push({
              name: item.name,
              value: item.averageCostOfUnitOfMeasure, // No rounding
              unit: '€',
              fill: colorPalette[index % colorPalette.length]
            });
          });
        }
      }
    }

    return processedData;
  };

  const processFinishedProductsData = (data: any[]): ChartData[] => {
    const processedDataMap: { [date: string]: { salesPrice: number; totalCost: number; profitPercentagePerItem: number } } = {};

    if (filterOptions.selectedItem) {
      // For a single product
      const filteredData = data
        .filter(item => item.finishedProductName === filterOptions.selectedItem)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      filteredData.forEach(item => {
        const date = item.date;
        if (!processedDataMap[date]) {
          processedDataMap[date] = { salesPrice: 0, totalCost: 0, profitPercentagePerItem: 0 };
        }
        processedDataMap[date].salesPrice += item.salesPrice;
        processedDataMap[date].totalCost += item.totalCost;
        processedDataMap[date].profitPercentagePerItem += item.profitPercentagePerItem;
      });
    } else {
      // For all products
      data.forEach(item => {
        const date = item.date;
        if (!processedDataMap[date]) {
          processedDataMap[date] = { salesPrice: 0, totalCost: 0, profitPercentagePerItem: 0 };
        }
        processedDataMap[date].salesPrice += item.salesPrice;
        processedDataMap[date].totalCost += item.totalCost;
        processedDataMap[date].profitPercentagePerItem += item.profitPercentagePerItem;
      });
    }

    // Convert the map to an array
    const processedData: ChartData[] = Object.keys(processedDataMap).map(date => ({
      name: date,
      salesPrice: parseFloat(processedDataMap[date].salesPrice.toFixed(2)),
      totalCost: parseFloat(processedDataMap[date].totalCost.toFixed(2)),
      profitPercentagePerItem: parseFloat(processedDataMap[date].profitPercentagePerItem.toFixed(2)),
    }));

    return processedData;
  };

  const processSalesData = (data: any[]): ChartData[] => {
    const processedData: ChartData[] = [];

    const filteredData = data.filter(item => filterOptions.selectedStatuses.includes(item.status));

    if (filterOptions.selectedItem) {
      // For a single product
      const filteredItems = filteredData.filter(item => item.finishedProductName === filterOptions.selectedItem)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      filteredItems.forEach(item => {
        processedData.push({
          name: item.date,
          value: item.quantity, // No rounding
          unit: 'units', // Assuming units
          fill: '#8884d8' // Fixed color for Quantity
        });
        processedData.push({
          name: item.date,
          value: item.totalPrice, // No rounding
          unit: '€',
          fill: '#82ca9d' // Fixed color for Revenue
        });
      });
    } else {
      // For all products
      data.forEach(item => {
        processedData.push({
          name: item.date,
          value: item.totalPrice, // No rounding
          unit: '€',
          fill: '#82ca9d' // Fixed color for Revenue
        });
      });
    }

    return processedData;
  };

  const processPurchaseData = (data: any[]): ChartData[] => {
    const processedData: ChartData[] = [];
    const dateProductMap: { [date: string]: { [product: string]: { quantity: number; cost: number; unit: string } } } = {};

    if (filterOptions.selectedItem) {
      // Filter data for the selected item
      const filteredData = data.filter(item => item.product === filterOptions.selectedItem);

      filteredData.forEach(item => {
        const date = item.date;
        const product = item.product;
        let quantity = item.purchUnitQty ? item.purchUnitQty : 0; // Assuming 'purchUnitQty' is the quantity purchased
        let unit = item.unitOfMeasure;
        let cost = item.averageCostOfUnitOfMeasure; // Using 'averageCostOfUnitOfMeasure' instead of 'totalCost'

        // Apply scaling based on unit
        if (unit.toLowerCase() === 'liters' || unit.toLowerCase() === 'milliliters') {
          quantity = quantity / 1000; // Convert ml to liters
          unit = 'L';
        } else if (unit.toLowerCase() === 'kilograms' || unit.toLowerCase() === 'grams') {
          quantity = quantity / 1000; // Convert grams to kilograms
          unit = 'kg';
        }

        if (!dateProductMap[date]) {
          dateProductMap[date] = {};
        }

        if (!dateProductMap[date][product]) {
          dateProductMap[date][product] = { quantity: 0, cost: cost, unit: unit };
        }

        dateProductMap[date][product].quantity += quantity;
        // For cost, we want the highest cost among purchases on the same date
        if (cost > dateProductMap[date][product].cost) {
          dateProductMap[date][product].cost = cost;
        }
      });

      Object.keys(dateProductMap).forEach(date => {
        const productData = dateProductMap[date][filterOptions.selectedItem];
        processedData.push({
          name: date,
          value: parseFloat(productData.quantity.toFixed(2)), // No rounding
          unit: productData.unit,
          fill: colorPalette[rawGoodsList.indexOf(filterOptions.selectedItem) % colorPalette.length]
        });
        processedData.push({
          name: date,
          value: parseFloat(productData.cost.toFixed(2)), // No rounding
          unit: '€',
          fill: '#ff7300' // Fixed color for Cost
        });
      });

      // Sort the processedData by date
      processedData.sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime());

    } else {
      // If no item is selected, process data for all products
      data.forEach(item => {
        const date = item.date;
        const product = item.product;
        let quantity = item.purchUnitQty ? item.purchUnitQty : 0; // Assuming 'purchUnitQty' is the quantity purchased
        let unit = item.unitOfMeasure;
        let cost = item.averageCostOfUnitOfMeasure; // Using 'averageCostOfUnitOfMeasure' instead of 'totalCost'

        // Apply scaling based on unit
        if (unit.toLowerCase() === 'liters' || unit.toLowerCase() === 'milliliters') {
          quantity = quantity / 1000; // Convert ml to liters
          unit = 'L';
        } else if (unit.toLowerCase() === 'kilograms' || unit.toLowerCase() === 'grams') {
          quantity = quantity / 1000; // Convert grams to kilograms
          unit = 'kg';
        }

        if (!dateProductMap[date]) {
          dateProductMap[date] = {};
        }

        if (!dateProductMap[date][product]) {
          dateProductMap[date][product] = { quantity: 0, cost: cost, unit: unit };
        }

        dateProductMap[date][product].quantity += quantity;
        // For cost, we want the highest cost among purchases on the same date
        if (cost > dateProductMap[date][product].cost) {
          dateProductMap[date][product].cost = cost;
        }
      });

      // Convert dateProductMap to processedData
      Object.keys(dateProductMap).forEach(date => {
        Object.keys(dateProductMap[date]).forEach(product => {
          const productData = dateProductMap[date][product];
          processedData.push({
            name: date,
            value: parseFloat(productData.quantity.toFixed(2)), // No rounding
            unit: productData.unit,
            fill: colorPalette[rawGoodsList.indexOf(product) % colorPalette.length]
          });
          processedData.push({
            name: date,
            value: parseFloat(productData.cost.toFixed(2)), // No rounding
            unit: '€',
            fill: '#ff7300' // Fixed color for Cost
          });
        });
      });

      // Sort the processedData by date
      processedData.sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime());
    }

    return processedData;
  };

  const handleFilterChange = (key: keyof FilterOptions, value: any) => {
    setFilterOptions(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case 'rawGoods':
        return 'Raw Goods Overview';
      case 'finishedProducts':
        return 'Finished Products Performance';
      case 'sales':
        return 'Sales Analysis';
      case 'purchases':
        return 'Purchase History';
      default:
        return '';
    }
  };

  const getItemsList = () => {
    switch (activeTab) {
      case 'rawGoods':
        return rawGoodsList;
      case 'finishedProducts':
        return finishedProductsList;
      case 'sales':
        return finishedProductsList;
      case 'purchases':
        return rawGoodsList;
      default:
        return [];
    }
  };

  const getAvailableGraphTypes = () => {
    switch (activeTab) {
      case 'rawGoods':
        return ['QuantityOnHand', 'AverageCostOfUOM'];
      case 'finishedProducts':
        return ['SalesPrice', 'CostOfItem', 'ProfitPercentagePerItem'];
      case 'sales':
        return ['Quantity', 'Revenue'];
      case 'purchases':
        return ['Quantity', 'Cost'];
      default:
        return [];
    }
  };

  const getStatusOptions = () => {
    // Assuming statuses are 'Paid', 'Pending', 'Cancelled', etc.
    return ['Paid', 'Pending', 'Cancelled'];
  };

  // Custom Tooltip to show all relevant information
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-300 p-4 rounded-lg shadow-lg">
          <p className="font-semibold">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={`item-${index}`} style={{ color: entry.color }}>
              {`${entry.name}: ${entry.value} ${entry.name.includes('Profit') ? '%' : '€'}`}
            </p>
          ))}
        </div>
      );
    }

    return null;
  };

  const renderChart = () => {
    if (chartData.length === 0) {
      return <p>No data available for the selected criteria.</p>;
    }

    let ChartComponent;

    switch (activeTab) {
      case 'rawGoods':
        ChartComponent = BarChart;
        return (
          <ResponsiveContainer width="100%" height={400}>
            <ChartComponent data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis
                label={{ value: 'Quantity', angle: -90, position: 'insideLeft' }}
                tickFormatter={(value: number) => `${value}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar
                dataKey="value"
                name={filterOptions.selectedGraph === 'QuantityOnHand' ? 'Quantity On Hand' : 'Average Cost of UOM'}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </ChartComponent>
          </ResponsiveContainer>
        );

      case 'finishedProducts':
        ChartComponent = LineChart;

        // Determine Y-Axis label and format based on selectedGraph
        let yAxisLabel = '';
        let yAxisFormatter = (value: number) => value;

        switch (filterOptions.selectedGraph) {
          case 'SalesPrice':
            yAxisLabel = 'Sales Price (€)';
            yAxisFormatter = (value: number) => `${value} €`;
            break;
          case 'CostOfItem':
            yAxisLabel = 'Cost of Item (€)';
            yAxisFormatter = (value: number) => `${value} €`;
            break;
          case 'ProfitPercentagePerItem':
            yAxisLabel = 'Profit (%)';
            yAxisFormatter = (value: number) => `${value} %`;
            break;
          default:
            yAxisLabel = 'Value';
            yAxisFormatter = (value: number) => `${value}`;
        }

        return (
          <ResponsiveContainer width="100%" height={400}>
            <ChartComponent data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis
                label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }}
                tickFormatter={yAxisFormatter}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {filterOptions.selectedGraph === 'SalesPrice' && (
                <Line
                  type="monotone"
                  dataKey="salesPrice"
                  name="Sales Price (€)"
                  stroke="#ff7300"
                  strokeWidth={2}
                  activeDot={{ r: 8 }}
                />
              )}
              {filterOptions.selectedGraph === 'CostOfItem' && (
                <Line
                  type="monotone"
                  dataKey="totalCost"
                  name="Cost of Item (€)"
                  stroke="#387908"
                  strokeWidth={2}
                />
              )}
              {filterOptions.selectedGraph === 'ProfitPercentagePerItem' && (
                <Line
                  type="monotone"
                  dataKey="profitPercentagePerItem"
                  name="Profit (%)"
                  stroke="#8884d8"
                  strokeWidth={2}
                />
              )}
            </ChartComponent>
          </ResponsiveContainer>
        );

      case 'sales':
        ChartComponent = LineChart;
        return (
          <ResponsiveContainer width="100%" height={400}>
            <ChartComponent data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis
                yAxisId="left"
                label={{ value: 'Quantity', angle: -90, position: 'insideLeft' }}
                tickFormatter={(value: number) => `${value.toFixed(2)}`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                label={{ value: 'Revenue (€)', angle: 90, position: 'insideRight' }}
                tickFormatter={(value: number) => `${value.toFixed(2)} €`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {filterOptions.selectedGraph === 'Quantity' && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="value"
                  name="Quantity"
                  stroke="#8884d8"
                  strokeWidth={2}
                />
              )}
              {filterOptions.selectedGraph === 'Revenue' && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="value"
                  name="Revenue"
                  stroke="#82ca9d"
                  strokeWidth={2}
                />
              )}
            </ChartComponent>
          </ResponsiveContainer>
        );

      case 'purchases':
        ChartComponent = LineChart;
        return (
          <ResponsiveContainer width="100%" height={400}>
            <ChartComponent data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis
                yAxisId="left"
                label={{ value: 'Quantity', angle: -90, position: 'insideLeft' }}
                tickFormatter={(value: number) => `${value.toFixed(2)}`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                label={{ value: 'Cost (€)', angle: 90, position: 'insideRight' }}
                tickFormatter={(value: number) => `${value.toFixed(2)} €`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {filterOptions.selectedGraph === 'Quantity' && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="value"
                  name="Quantity"
                  stroke="#8884d8"
                  strokeWidth={2}
                />
              )}
              {filterOptions.selectedGraph === 'Cost' && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="value"
                  name="Cost"
                  stroke="#ff7300"
                  strokeWidth={2}
                />
              )}
            </ChartComponent>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  const handleGraphSelection = (graphType: string) => {
    setFilterOptions(prev => ({
      ...prev,
      selectedGraph: prev.selectedGraph === graphType ? null : graphType // Toggle selection
    }));
  };

  const handleStatusSelection = (status: string) => {
    let updatedStatuses = [...filterOptions.selectedStatuses];
    if (updatedStatuses.includes(status)) {
      updatedStatuses = updatedStatuses.filter(s => s !== status);
    } else {
      updatedStatuses.push(status);
    }
    setFilterOptions(prev => ({
      ...prev,
      selectedStatuses: updatedStatuses
    }));
  };

  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        {userLoggedIn === false ? (
          <p className="text-red-500">Please log in to view trends.</p>
        ) : (
          <>
            {/* Tab Buttons */}
            <div className="flex justify-center space-x-6 mb-8">
              {[
                { id: 'rawGoods', label: 'Raw Goods' },
                { id: 'finishedProducts', label: 'Finished Products' },
                { id: 'sales', label: 'Sales' },
                { id: 'purchases', label: 'Purchases' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as TabType);
                    setFilterOptions(prev => ({
                      ...prev,
                      selectedItem: '',
                      selectedGraph: tab.id === 'finishedProducts' ? null : (tab.id === 'rawGoods' ? 'QuantityOnHand' : null),
                      selectedStatuses: tab.id === 'sales' ? ['Paid'] : [],
                    }));
                  }}
                  className={`px-8 py-4 rounded-lg font-semibold text-xl transition-colors duration-300 ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-300 text-gray-800 hover:bg-gray-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="bg-white p-6 rounded-lg shadow mb-8">
              <h2 className="text-2xl font-bold mb-6 text-center">{getTabTitle()}</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {activeTab !== 'rawGoods' && (
                  <div>
                    <label className="block text-lg font-medium text-gray-700 mb-2">Date Range</label>
                    <div className="flex space-x-4">
                      <DatePicker
                        selected={filterOptions.dateRange.startDate}
                        onChange={date => handleFilterChange('dateRange', {
                          ...filterOptions.dateRange,
                          startDate: date
                        })}
                        className="w-full p-3 border border-gray-300 rounded-lg"
                        placeholderText="Start Date"
                      />
                      <DatePicker
                        selected={filterOptions.dateRange.endDate}
                        onChange={date => handleFilterChange('dateRange', {
                          ...filterOptions.dateRange,
                          endDate: date
                        })}
                        className="w-full p-3 border border-gray-300 rounded-lg"
                        placeholderText="End Date"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-lg font-medium text-gray-700 mb-2">Select Item</label>
                  <select
                    value={filterOptions.selectedItem}
                    onChange={e => handleFilterChange('selectedItem', e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg"
                  >
                    <option value="">All Items</option>
                    {getItemsList().map(item => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>

                {activeTab === 'sales' && (
                  <div>
                    <label className="block text-lg font-medium text-gray-700 mb-2">Select Status</label>
                    <div className="flex space-x-4">
                      {getStatusOptions().map(status => (
                        <button
                          key={status}
                          onClick={() => handleStatusSelection(status)}
                          className={`px-6 py-2 rounded-lg font-semibold text-lg transition-colors duration-300 ${
                            filterOptions.selectedStatuses.includes(status)
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-300 text-gray-800 hover:bg-gray-400'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Graph Type Selection and Chart */}
            <div>
              {/* Graph Type Selection */}
              <div className="bg-gray-100 p-6 rounded-lg shadow mb-6">
                <div className="flex justify-center space-x-6">
                  {getAvailableGraphTypes().map(graphType => (
                    <button
                      key={graphType}
                      onClick={() => handleGraphSelection(graphType)}
                      className={`px-8 py-3 rounded-lg font-semibold text-xl transition-colors duration-300 ${
                        filterOptions.selectedGraph === graphType
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-300 text-gray-800 hover:bg-gray-400'
                      }`}
                    >
                      {graphType === 'QuantityOnHand' ? 'Quantity' :
                        graphType === 'AverageCostOfUOM' ? 'Avg Cost' :
                        graphType === 'SalesPrice' ? 'Sales Price' :
                        graphType === 'CostOfItem' ? 'Cost of Item' :
                        graphType === 'ProfitPercentagePerItem' ? 'Profit %' :
                        graphType === 'Revenue' ? 'Revenue' :
                        graphType === 'Cost' ? 'Cost' : graphType}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart */}
              <div className="bg-white p-6 rounded-lg shadow">
                {loading ? (
                  <div className="flex justify-center items-center h-96">
                    <p className="text-xl">Loading data...</p>
                  </div>
                ) : error ? (
                  <div className="bg-red-100 p-4 rounded-lg">
                    <p className="text-red-500 text-lg">{error}</p>
                  </div>
                ) : (
                  renderChart()
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default CostHistoryDashboard;
