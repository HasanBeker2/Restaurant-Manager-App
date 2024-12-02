import React, { useState, useEffect } from 'react';
import Layout from './Layout';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import dayjs, { Dayjs } from 'dayjs';
import { ClipLoader } from 'react-spinners';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Define Metric and SelectedMetric types
type Metric = 'salesPrice' | 'totalCost' | 'profitPerItem' | 'profitPercentagePerItem';
type SelectedMetric = Metric | 'all';

interface FinishedProductsListProps {
  logo: string;
  restaurantName: string;
}

interface BOMAssembly {
  id: string;
  finishedProductName: string;
  articleNumber: string;
  date: string;
  salesDescription: string;
  salesPrice: number;
  totalCost: number;
  profitPerItem: number;
  profitPercentagePerItem: number;
  assemblyItems: any[];
  timestamp: number;
}

interface ChartData {
  date: string;
  salesPrice: number;
  totalCost: number;
  profitPerItem: number;
  profitPercentagePerItem: number;
}

const FinishedProductsList: React.FC<FinishedProductsListProps> = ({ logo, restaurantName }) => {
  const [finishedProducts, setFinishedProducts] = useState<BOMAssembly[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productHistory, setProductHistory] = useState<BOMAssembly[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [selectedMetrics, setSelectedMetrics] = useState<SelectedMetric[]>(['salesPrice']); // Allow multiple metrics
  const [timeRange, setTimeRange] = useState<
    'all' | 'lastDay' | 'lastWeek' | 'lastMonth' | 'last3Months' | 'last6Months' | 'lastYear' | 'custom'
  >('all');
  const [customDateRange, setCustomDateRange] = useState<{ start?: Date; end?: Date }>({
    start: undefined,
    end: undefined,
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchFinishedProducts(user.uid);
      } else {
        setError('Please log in to view history.');
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchFinishedProducts = async (userId: string) => {
    try {
      const bomAssembliesRef = collection(db, 'bomAssemblies');
      const q = query(bomAssembliesRef, where('userId', '==', userId));

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const products: BOMAssembly[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data() as Omit<BOMAssembly, 'id'>; // Exclude 'id' from data
          products.push({
            id: doc.id,
            ...data,
          });
        });
        setFinishedProducts(products);
        // Set the first product as default selected
        if (products.length > 0 && !selectedProductId) {
          setSelectedProductId(products[0].id);
        }
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err) {
      console.error('Error fetching finished products:', err);
      setError('Finished products data could not be fetched.');
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchProductHistory = async () => {
      if (!selectedProductId) return;

      setHistoryLoading(true);
      try {
        const historyRef = collection(db, 'bomAssembliesHistory');
        const q = query(
          historyRef,
          where('userId', '==', auth.currentUser?.uid || ''),
          where('bomAssemblyId', '==', selectedProductId)
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const history: BOMAssembly[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data() as Omit<BOMAssembly, 'id'>; // Exclude 'id' from data
            history.push({
              id: doc.id,
              ...data,
            });
          });

          // Add current state
          const currentProduct = finishedProducts.find((p) => p.id === selectedProductId);
          if (currentProduct) {
            history.push(currentProduct);
          }

          // Sort by timestamp - newest first
          history.sort((a, b) => b.timestamp - a.timestamp);
          setProductHistory(history);

          // Prepare chart data based on time range
          const now = dayjs();
          let filteredHistory = [...history]; // Clone history

          if (timeRange !== 'all' && timeRange !== 'custom') {
            let comparisonDate: Dayjs;
            switch (timeRange) {
              case 'lastDay':
                comparisonDate = now.subtract(1, 'day');
                break;
              case 'lastWeek':
                comparisonDate = now.subtract(1, 'week');
                break;
              case 'lastMonth':
                comparisonDate = now.subtract(1, 'month');
                break;
              case 'last3Months':
                comparisonDate = now.subtract(3, 'month');
                break;
              case 'last6Months':
                comparisonDate = now.subtract(6, 'month');
                break;
              case 'lastYear':
                comparisonDate = now.subtract(1, 'year');
                break;
              default:
                comparisonDate = dayjs(0); // Earliest date
            }
            filteredHistory = filteredHistory.filter((entry) => dayjs(entry.timestamp).isAfter(comparisonDate));
          } else if (timeRange === 'custom' && customDateRange.start && customDateRange.end) {
            const startDate = dayjs(customDateRange.start);
            const endDate = dayjs(customDateRange.end);
            filteredHistory = filteredHistory.filter((entry) =>
              dayjs(entry.timestamp).isBetween(startDate, endDate, 'day', '[]')
            );
          }

          // Sort ascending for chart
          filteredHistory.sort((a, b) => a.timestamp - b.timestamp);

          const chartData: ChartData[] = filteredHistory.map((entry) => ({
            date: dayjs(entry.timestamp).format('DD.MM.YYYY'),
            salesPrice: entry.salesPrice,
            totalCost: entry.totalCost,
            profitPerItem: entry.profitPerItem,
            profitPercentagePerItem: entry.profitPercentagePerItem,
          }));

          setChartData(chartData);
          setHistoryLoading(false);
        });

        return () => unsubscribe();
      } catch (err) {
        console.error('Error fetching product history:', err);
        setError('Product history data could not be fetched.');
        setHistoryLoading(false);
      }
    };

    fetchProductHistory();
  }, [selectedProductId, finishedProducts, timeRange, customDateRange]);

  const renderChart = () => {
    if (chartData.length === 0) return null;

    const metricsToDisplay: Metric[] = selectedMetrics.includes('all')
      ? ['salesPrice', 'totalCost', 'profitPerItem', 'profitPercentagePerItem']
      : selectedMetrics.filter((metric): metric is Metric => metric !== 'all');

    const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#d0ed57', '#a4de6c', '#8dd1e1'];

    return (
      <div style={{ width: '100%', height: 400 }}>
        <ResponsiveContainer>
          {chartType === 'line' ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip
                formatter={(value: any, name: string) => {
                  if (name.includes('Percentage')) {
                    return [`${value.toFixed(2)}%`, name];
                  } else {
                    return [`€${value.toFixed(2)}`, name];
                  }
                }}
              />
              <Legend />
              {metricsToDisplay.map((metric, index) => (
                <Line
                  key={metric}
                  type="monotone"
                  dataKey={metric}
                  stroke={colors[index % colors.length]}
                  activeDot={{ r: 8 }}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip
                formatter={(value: any, name: string) => {
                  if (name.includes('Percentage')) {
                    return [`${value.toFixed(2)}%`, name];
                  } else {
                    return [`€${value.toFixed(2)}`, name];
                  }
                }}
              />
              <Legend />
              {metricsToDisplay.map((metric, index) => (
                <Bar key={metric} dataKey={metric} fill={colors[index % colors.length]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  };

  const getMetricDisplay = (metric: Metric) => {
    switch (metric) {
      case 'salesPrice':
        return '€';
      case 'totalCost':
        return '€';
      case 'profitPerItem':
        return '€';
      case 'profitPercentagePerItem':
        return '%';
      default:
        return '';
    }
  };

  const renderSummaryStatistics = () => {
    if (!productHistory.length) return null;

    const metrics: Metric[] = ['salesPrice', 'totalCost', 'profitPerItem', 'profitPercentagePerItem'];

    return (
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4">Summary Statistics</h3>
        <div className="grid grid-cols-4 gap-4">
          {metrics.map((metric) => {
            const values = productHistory.map((entry) => entry[metric]);
            const average = values.reduce((a, b) => a + b, 0) / values.length;
            const min = Math.min(...values);
            const max = Math.max(...values);

            return (
              <div key={metric} className="bg-gray-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium mb-2">
                  {metric.split(/(?=[A-Z])/).join(' ')}
                </h4>
                <div className="space-y-2 text-sm">
                  <p>Average: {`${average.toFixed(2)}${getMetricDisplay(metric)}`}</p>
                  <p>Min: {`${min.toFixed(2)}${getMetricDisplay(metric)}`}</p>
                  <p>Max: {`${max.toFixed(2)}${getMetricDisplay(metric)}`}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">Finished Products History</h1>
        {loading ? (
          <div className="flex justify-center items-center">
            <ClipLoader size={50} color={"#123abc"} loading={loading} />
            <span className="ml-2">Loading finished products...</span>
          </div>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : finishedProducts.length === 0 ? (
          <p>No finished products found.</p>
        ) : (
          <>
            {/* Product Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Finished Product
              </label>
              <div className="flex flex-wrap space-x-2">
                {finishedProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => setSelectedProductId(product.id)}
                    className={`px-4 py-2 rounded ${
                      selectedProductId === product.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    {product.finishedProductName}
                  </button>
                ))}
              </div>
            </div>

            {/* Chart Controls and Chart */}
            {selectedProductId && (
              <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                <div className="grid grid-cols-7 gap-4 mb-4">
                  {/* Metric Selection */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Metric
                    </label>
                    <select
                      value={selectedMetrics.includes('all') ? 'all' : selectedMetrics[0]}
                      onChange={(e) => {
                        const value = e.target.value as SelectedMetric;
                        if (value === 'all') {
                          setSelectedMetrics(['all']);
                        } else {
                          setSelectedMetrics([value]);
                        }
                      }}
                      className="w-full p-2 border rounded"
                    >
                      <option value="all">All Metrics</option>
                      <option value="salesPrice">Sales Price</option>
                      <option value="totalCost">Total Cost</option>
                      <option value="profitPerItem">Profit per Item</option>
                      <option value="profitPercentagePerItem">Profit Percentage</option>
                    </select>
                  </div>

                  {/* Chart Type Selection */}
                  <div className="col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Chart Type
                    </label>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setChartType('line')}
                        className={`px-4 py-2 rounded ${
                          chartType === 'line'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        Line
                      </button>
                      <button
                        onClick={() => setChartType('bar')}
                        className={`px-4 py-2 rounded ${
                          chartType === 'bar'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        Bar
                      </button>
                    </div>
                  </div>

                  {/* Time Range Selection */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Time Range
                    </label>
                    <select
                      value={timeRange}
                      onChange={(e) => setTimeRange(e.target.value as any)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="all">All Time</option>
                      <option value="lastDay">Last Day</option>
                      <option value="lastWeek">Last Week</option>
                      <option value="lastMonth">Last Month</option>
                      <option value="last3Months">Last 3 Months</option>
                      <option value="last6Months">Last 6 Months</option>
                      <option value="lastYear">Last Year</option>
                      <option value="custom">Custom Range</option>
                    </select>
                  </div>

                  {/* Custom Date Range Selector */}
                  {timeRange === 'custom' && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Date Range
                      </label>
                      <div className="flex space-x-2">
                        <DatePicker
                          selected={customDateRange.start}
                          onChange={(date: Date | null) =>
                            setCustomDateRange({ ...customDateRange, start: date || undefined })
                          }
                          selectsStart
                          startDate={customDateRange.start}
                          endDate={customDateRange.end}
                          placeholderText="Start Date"
                          className="w-full p-2 border rounded"
                        />
                        <DatePicker
                          selected={customDateRange.end}
                          onChange={(date: Date | null) =>
                            setCustomDateRange({ ...customDateRange, end: date || undefined })
                          }
                          selectsEnd
                          startDate={customDateRange.start}
                          endDate={customDateRange.end}
                          minDate={customDateRange.start}
                          placeholderText="End Date"
                          className="w-full p-2 border rounded"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Chart */}
                {historyLoading ? (
                  <div className="flex justify-center items-center">
                    <ClipLoader size={30} color={"#123abc"} loading={historyLoading} />
                    <span className="ml-2">Loading chart...</span>
                  </div>
                ) : (
                  renderChart()
                )}

                {/* Summary Statistics */}
                {renderSummaryStatistics()}
              </div>
            )}

            {/* History Table */}
            {selectedProductId && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Detailed History</h2>
                {historyLoading ? (
                  <div className="flex justify-center items-center">
                    <ClipLoader size={30} color={"#123abc"} loading={historyLoading} />
                    <span className="ml-2">Loading history...</span>
                  </div>
                ) : productHistory.length === 0 ? (
                  <p>No history available for this product.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="py-2 px-4 border-b text-center">Date & Time</th>
                          <th className="py-2 px-4 border-b text-center">Sales Price</th>
                          <th className="py-2 px-4 border-b text-center">Total Cost</th>
                          <th className="py-2 px-4 border-b text-center">Profit per Item</th>
                          <th className="py-2 px-4 border-b text-center">Profit Percentage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productHistory.map((entry) => (
                          <tr key={entry.id} className="hover:bg-gray-50">
                            <td className="py-2 px-4 border-b text-center">
                              {dayjs(entry.timestamp).format('DD.MM.YYYY HH:mm:ss')}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              €{entry.salesPrice.toFixed(2)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              €{entry.totalCost.toFixed(2)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              €{entry.profitPerItem.toFixed(2)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {entry.profitPercentagePerItem.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default FinishedProductsList;
