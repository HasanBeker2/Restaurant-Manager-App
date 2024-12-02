// RawGoodsList.tsx
import React, { useState, useEffect } from 'react';
import Layout from './Layout';
import { collection, query, where, onSnapshot, getDocs, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import dayjs from 'dayjs';
import { ClipLoader } from 'react-spinners';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface RawGoodsListProps {
  logo: string;
  restaurantName: string;
}

interface RawGood {
  id: string;
  name: string;
  qtyOnHand: number;
  costOfUnit: number;
  purchUnitQty: number;
  unitOfMeasure: string;
  purchaseUnit: string;
  averageCostOfUnitOfMeasure: number;
  lastCostOfUnitOfMeasure: number;
  lastCostOfUnit?: number;
  date?: Date;
  timestamp: number;
}

interface HistoryEntry {
  timestamp: number;
  date: string;
  costOfUnit: number;
  lastCostOfUnitOfMeasure: number;
  averageCostOfUnitOfMeasure: number;
  qtyOnHand: number;
}

const RawGoodsList: React.FC<RawGoodsListProps> = ({ logo, restaurantName }) => {
  const [rawGoods, setRawGoods] = useState<RawGood[]>([]);
  const [selectedGoodId, setSelectedGoodId] = useState<string>('');
  const [goodHistory, setGoodHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartMetric, setChartMetric] = useState<string>('costOfUnit');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchRawGoods(user.uid);
      } else {
        setError('Please log in to view raw goods history.');
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchRawGoods = async (userId: string) => {
    try {
      const rawGoodsRef = collection(db, 'rawGoods');
      const q = query(rawGoodsRef, where('userId', '==', userId));

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const goods: RawGood[] = [];
        querySnapshot.forEach((doc) => {
          goods.push({
            id: doc.id,
            ...doc.data(),
          } as RawGood);
        });
        setRawGoods(goods);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err) {
      console.error('Error fetching raw goods:', err);
      setError('Error fetching raw goods data.');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedGoodId) return;

    const fetchGoodHistory = async () => {
      setHistoryLoading(true);
      try {
        const historyRef = collection(db, 'rawGoodsHistory');
        const q = query(
          historyRef,
          where('userId', '==', auth.currentUser?.uid || ''),
          where('rawGoodId', '==', selectedGoodId)
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const history: HistoryEntry[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            history.push({
              timestamp: data.timestamp,
              date: dayjs(data.timestamp).format('DD.MM.YYYY HH:mm:ss'),
              costOfUnit: data.costOfUnit,
              lastCostOfUnitOfMeasure: data.lastCostOfUnitOfMeasure,
              averageCostOfUnitOfMeasure: data.averageCostOfUnitOfMeasure,
              qtyOnHand: data.qtyOnHand,
            });
          });

          // Add current state
          const currentGood = rawGoods.find((g) => g.id === selectedGoodId);
          if (currentGood) {
            history.push({
              timestamp: Date.now(),
              date: dayjs().format('DD.MM.YYYY HH:mm:ss'),
              costOfUnit: currentGood.costOfUnit,
              lastCostOfUnitOfMeasure: currentGood.lastCostOfUnitOfMeasure,
              averageCostOfUnitOfMeasure: currentGood.averageCostOfUnitOfMeasure,
              qtyOnHand: currentGood.qtyOnHand,
            });
          }

          // Sort by timestamp
          history.sort((a, b) => a.timestamp - b.timestamp);
          setGoodHistory(history);

          // Prepare chart data
          const chartData = history.map((entry) => ({
            date: dayjs(entry.timestamp).format('DD.MM.YYYY'),
            costOfUnit: entry.costOfUnit,
            lastCostOfUnitOfMeasure: entry.lastCostOfUnitOfMeasure,
            averageCostOfUnitOfMeasure: entry.averageCostOfUnitOfMeasure,
            qtyOnHand: entry.qtyOnHand,
          }));
          setChartData(chartData);

          setHistoryLoading(false);
        });

        return () => unsubscribe();
      } catch (err) {
        console.error('Error fetching raw good history:', err);
        setError('Error fetching history data.');
        setHistoryLoading(false);
      }
    };

    fetchGoodHistory();
  }, [selectedGoodId, rawGoods]);

  const getUnitAbbreviation = (unitOfMeasure: string) => {
    switch (unitOfMeasure) {
      case 'Grams':
        return 'gr';
      case 'Kilograms':
        return 'kg';
      case 'Milliliters':
        return 'ml';
      case 'Liters':
        return 'L';
      default:
        return '';
    }
  };

  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">Raw Goods History</h1>
        {loading ? (
          <div className="flex justify-center items-center">
            <ClipLoader size={50} color={"#123abc"} loading={loading} />
            <span className="ml-2">Loading raw goods...</span>
          </div>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : rawGoods.length === 0 ? (
          <p>No raw goods found.</p>
        ) : (
          <>
            {/* Good Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Raw Good
              </label>
              <div className="flex flex-wrap space-x-2">
                {rawGoods.map((good) => (
                  <button
                    key={good.id}
                    onClick={() => setSelectedGoodId(good.id)}
                    className={`px-4 py-2 rounded ${
                      selectedGoodId === good.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    {good.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Chart Metric Selection */}
            {selectedGoodId && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Metric to Display
                </label>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setChartMetric('costOfUnit')}
                    className={`px-4 py-2 rounded ${
                      chartMetric === 'costOfUnit'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    Cost per Unit
                  </button>
                  <button
                    onClick={() => setChartMetric('lastCostOfUnitOfMeasure')}
                    className={`px-4 py-2 rounded ${
                      chartMetric === 'lastCostOfUnitOfMeasure'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    Last Cost per UoM
                  </button>
                  <button
                    onClick={() => setChartMetric('averageCostOfUnitOfMeasure')}
                    className={`px-4 py-2 rounded ${
                      chartMetric === 'averageCostOfUnitOfMeasure'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    Average Cost per UoM
                  </button>
                  <button
                    onClick={() => setChartMetric('qtyOnHand')}
                    className={`px-4 py-2 rounded ${
                      chartMetric === 'qtyOnHand'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    Quantity on Hand
                  </button>
                </div>
              </div>
            )}

            {/* Chart */}
            {selectedGoodId && chartData.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">
                  {rawGoods.find((g) => g.id === selectedGoodId)?.name} - Historical Data
                </h2>
                <div style={{ width: '100%', height: 400 }}>
                  <ResponsiveContainer>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey={chartMetric}
                        stroke="#8884d8"
                        activeDot={{ r: 8 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* History Table */}
            {selectedGoodId && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Detailed History</h2>
                {historyLoading ? (
                  <div className="flex justify-center items-center">
                    <ClipLoader size={30} color={"#123abc"} loading={historyLoading} />
                    <span className="ml-2">Loading history...</span>
                  </div>
                ) : goodHistory.length === 0 ? (
                  <p>No history available for this raw good.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="py-2 px-4 border-b text-center">Date & Time</th>
                          <th className="py-2 px-4 border-b text-center">Cost per Unit (€)</th>
                          <th className="py-2 px-4 border-b text-center">Last Cost per UoM (€)</th>
                          <th className="py-2 px-4 border-b text-center">Avg Cost per UoM (€)</th>
                          <th className="py-2 px-4 border-b text-center">Quantity on Hand</th>
                        </tr>
                      </thead>
                      <tbody>
                        {goodHistory.map((entry, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="py-2 px-4 border-b text-center">{entry.date}</td>
                            <td className="py-2 px-4 border-b text-center">
                              €{entry.costOfUnit.toFixed(2)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              €{entry.lastCostOfUnitOfMeasure.toFixed(4)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              €{entry.averageCostOfUnitOfMeasure.toFixed(4)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {entry.qtyOnHand.toFixed(2)}{' '}
                              {getUnitAbbreviation(
                                rawGoods.find((g) => g.id === selectedGoodId)?.unitOfMeasure || ''
                              )}
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

export default RawGoodsList;

