import React, { useState, useEffect } from 'react';
import Layout from './Layout';
import { db, auth } from '../firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  getDocs,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Trash2 } from 'lucide-react';

interface StockCountProps {
  logo: string;
  restaurantName: string;
}

interface RawGood {
  id: string;
  name: string;
  qtyOnHand: number;
  unitOfMeasure: string;
}

interface StockCountItem {
  rawGoodId: string;
  name: string;
  countedQuantity: number;
  qtyOnHand: number;
  difference: number;
  unitOfMeasure: string;
}

interface StockCountEntry {
  id: string;
  date: Timestamp;
  items: StockCountItem[];
}

const StockCount: React.FC<StockCountProps> = ({ logo, restaurantName }) => {
  const [rawGoodsList, setRawGoodsList] = useState<RawGood[]>([]);
  const [stockCounts, setStockCounts] = useState<StockCountEntry[]>([]);
  const [countInputs, setCountInputs] = useState<{ [key: string]: string }>({});
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
  const [selectedStockCount, setSelectedStockCount] = useState<StockCountEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLoggedIn, setUserLoggedIn] = useState<boolean | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserLoggedIn(true);
      } else {
        setUserLoggedIn(false);
        setLoading(false);
        setError('No user logged in. Please log in to perform stock counts.');
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let unsubscribeRawGoods: () => void;
    let unsubscribeStockCounts: () => void;

    const fetchData = async () => {
      if (!auth.currentUser) return;

      try {
        // Fetch Raw Goods
        const rawGoodsRef = collection(db, 'rawGoods');
        const qRawGoods = query(rawGoodsRef, where('userId', '==', auth.currentUser.uid));
        unsubscribeRawGoods = onSnapshot(qRawGoods, (querySnapshot) => {
          const rawGoods = querySnapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() } as RawGood)
          );
          setRawGoodsList(rawGoods);
          setLoading(false);
        });

        // Fetch Stock Counts
        const stockCountsRef = collection(db, 'stockCounts');
        const qStockCounts = query(stockCountsRef, where('userId', '==', auth.currentUser.uid));
        unsubscribeStockCounts = onSnapshot(qStockCounts, (querySnapshot) => {
          const counts = querySnapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() } as StockCountEntry)
          );
          setStockCounts(counts);

          // En son sayımı seçili hale getir
          if (counts.length > 0) {
            const latestCount = counts.sort((a, b) => b.date.seconds - a.date.seconds)[0];
            setSelectedStockCount(latestCount);
          }
        });
      } catch (error) {
        console.error('Error setting up listeners: ', error);
        setError('An error occurred while fetching data. Please try again.');
        setLoading(false);
      }
    };

    if (userLoggedIn) {
      fetchData();
    }

    return () => {
      if (unsubscribeRawGoods) unsubscribeRawGoods();
      if (unsubscribeStockCounts) unsubscribeStockCounts();
    };
  }, [userLoggedIn]);

  const handleCountInputChange = (e: React.ChangeEvent<HTMLInputElement>, rawGoodId: string) => {
    const { value } = e.target;
    setCountInputs((prev) => ({
      ...prev,
      [rawGoodId]: value,
    }));
  };

  const convertFromBaseUnit = (quantity: number, unitOfMeasure: string): number => {
    if (unitOfMeasure === 'Kilograms' || unitOfMeasure === 'Liters') {
      return quantity / 1000;
    }
    return quantity;
  };

  const convertToBaseUnit = (quantity: number, unitOfMeasure: string): number => {
    if (unitOfMeasure === 'Kilograms' || unitOfMeasure === 'Liters') {
      return quantity * 1000;
    }
    return quantity;
  };

  const handleSubmitCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      const items: StockCountItem[] = rawGoodsList.map((rawGood) => {
        const countedQuantityInput = parseFloat(countInputs[rawGood.id]);
        if (isNaN(countedQuantityInput)) {
          throw new Error('Please enter valid numbers for all counted quantities.');
        }
        const countedQuantity = convertToBaseUnit(countedQuantityInput, rawGood.unitOfMeasure);
        const qtyOnHand = rawGood.qtyOnHand;
        const difference = countedQuantity - qtyOnHand;

        return {
          rawGoodId: rawGood.id,
          name: rawGood.name,
          countedQuantity: countedQuantityInput,
          qtyOnHand: convertFromBaseUnit(qtyOnHand, rawGood.unitOfMeasure),
          difference: convertFromBaseUnit(difference, rawGood.unitOfMeasure),
          unitOfMeasure: rawGood.unitOfMeasure,
        };
      });

      // Save Stock Count Entry
      const stockCountData = {
        date: Timestamp.fromDate(new Date()),
        items,
        userId: auth.currentUser.uid,
      };
      const docRef = await addDoc(collection(db, 'stockCounts'), stockCountData);

      // Update Raw Goods Quantities
      const batch = writeBatch(db);
      rawGoodsList.forEach((rawGood) => {
        const countedQuantityInput = parseFloat(countInputs[rawGood.id]);
        const countedQuantity = convertToBaseUnit(countedQuantityInput, rawGood.unitOfMeasure);
        const rawGoodRef = doc(db, 'rawGoods', rawGood.id);
        batch.update(rawGoodRef, { qtyOnHand: countedQuantity });
      });
      await batch.commit();

      // Reset count inputs
      setCountInputs({});
      setSuccessMessage('Stock count submitted successfully.');
      setTimeout(() => setSuccessMessage(null), 5000);

      // En son sayımı seçili hale getir
      setSelectedStockCount({ id: docRef.id, ...stockCountData });
    } catch (error) {
      console.error('Error submitting stock count: ', error);
      setError('Failed to submit stock count. Please try again.');
    }
  };

  const displayDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getUnitAbbreviation = (unitOfMeasure: string) => {
    switch (unitOfMeasure) {
      case 'Grams':
        return 'g';
      case 'Kilograms':
        return 'kg';
      case 'Milliliters':
        return 'ml';
      case 'Liters':
        return 'L';
      case 'Count':
        return 'cnt';
      default:
        return '';
    }
  };

  const handleStockCountSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const selectedCount = stockCounts.find((count) => count.id === selectedId);
    setSelectedStockCount(selectedCount || null);
  };

  const handleDeleteStockCount = async (id: string) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this stock count?');
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, 'stockCounts', id));
      setSelectedStockCount(null);
      setSuccessMessage('Stock count deleted successfully.');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error) {
      console.error('Error deleting stock count: ', error);
      setError('Failed to delete stock count. Please try again.');
    }
  };

  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        {userLoggedIn === false ? (
          <p className="text-red-500">Please log in to perform stock counts.</p>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <div className="flex mb-4">
                <button
                  className={`px-4 py-2 mr-2 ${
                    activeTab === 'new' ? 'bg-blue-500 text-white' : 'bg-gray-200'
                  } rounded`}
                  onClick={() => setActiveTab('new')}
                >
                  New Stock Count
                </button>
                <button
                  className={`px-4 py-2 ${
                    activeTab === 'history' ? 'bg-blue-500 text-white' : 'bg-gray-200'
                  } rounded`}
                  onClick={() => setActiveTab('history')}
                >
                  Stock Count History
                </button>
              </div>

              {successMessage && (
                <div className="bg-green-100 text-green-700 p-2 mb-4 rounded">
                  {successMessage}
                </div>
              )}

              {activeTab === 'new' ? (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Perform New Stock Count</h2>
                  {loading ? (
                    <p>Loading raw goods...</p>
                  ) : error ? (
                    <p className="text-red-500">{error}</p>
                  ) : rawGoodsList.length === 0 ? (
                    <p>No raw goods found. Please add raw goods before performing a stock count.</p>
                  ) : (
                    <form onSubmit={handleSubmitCount}>
                      <table className="min-w-full bg-white">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="py-2 px-4 border-b">ID</th>
                            <th className="py-2 px-4 border-b">Product Name</th>
                            <th className="py-2 px-4 border-b">Current Qty</th>
                            <th className="py-2 px-4 border-b">Counted Qty</th>
                            <th className="py-2 px-4 border-b">Difference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rawGoodsList.map((rawGood, index) => {
                            const countedQuantityInput = parseFloat(countInputs[rawGood.id]);
                            const qtyOnHandDisplay = convertFromBaseUnit(
                              rawGood.qtyOnHand,
                              rawGood.unitOfMeasure
                            );
                            const difference =
                              countedQuantityInput !== undefined && !isNaN(countedQuantityInput)
                                ? countedQuantityInput - qtyOnHandDisplay
                                : null;

                            let differenceBgColor = '';
                            if (difference !== null) {
                              if (difference < 0) {
                                differenceBgColor = 'bg-red-100';
                              } else if (difference > 0) {
                                differenceBgColor = 'bg-yellow-100';
                              } else {
                                differenceBgColor = 'bg-green-100';
                              }
                            }

                            return (
                              <tr key={rawGood.id} className="hover:bg-gray-50">
                                <td className="py-2 px-4 border-b text-center">{index + 1}</td>
                                <td className="py-2 px-4 border-b text-center">{rawGood.name}</td>
                                <td className="py-2 px-4 border-b text-center">
                                  {qtyOnHandDisplay.toFixed(2)}{' '}
                                  {getUnitAbbreviation(rawGood.unitOfMeasure)}
                                </td>
                                <td className="py-2 px-4 border-b text-center">
                                  <input
                                    type="number"
                                    step="any"
                                    value={countInputs[rawGood.id] || ''}
                                    onChange={(e) => handleCountInputChange(e, rawGood.id)}
                                    className="w-24 p-1 border rounded text-sm text-center"
                                    required
                                  />
                                </td>
                                <td
                                  className={`py-2 px-4 border-b text-center ${differenceBgColor}`}
                                >
                                  {difference !== null
                                    ? `${difference.toFixed(2)} ${getUnitAbbreviation(
                                        rawGood.unitOfMeasure
                                      )}`
                                    : ''}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <button
                        type="submit"
                        className="mt-4 bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
                      >
                        Submit Stock Count
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Stock Count History</h2>
                  {stockCounts.length === 0 ? (
                    <p>No stock counts recorded yet.</p>
                  ) : (
                    <div>
                      <div className="flex items-center mb-4">
                        <label htmlFor="stockCountSelect" className="mr-2 font-medium">
                          Select Stock Count:
                        </label>
                        <select
                          id="stockCountSelect"
                          value={selectedStockCount?.id || ''}
                          onChange={handleStockCountSelection}
                          className="p-2 border rounded"
                        >
                          {stockCounts
                            .sort((a, b) => b.date.seconds - a.date.seconds)
                            .map((count) => (
                              <option key={count.id} value={count.id}>
                                {displayDate(count.date)}
                              </option>
                            ))}
                        </select>
                        {selectedStockCount && (
                          <button
                            onClick={() => handleDeleteStockCount(selectedStockCount.id)}
                            className="ml-4 text-red-500 hover:text-red-700"
                            title="Delete Stock Count"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                      {selectedStockCount ? (
                        <div>
                          <h3 className="text-lg font-semibold mb-2">
                            Date: {displayDate(selectedStockCount.date)}
                          </h3>
                          <table className="min-w-full bg-white">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="py-2 px-4 border-b">ID</th>
                                <th className="py-2 px-4 border-b">Product Name</th>
                                <th className="py-2 px-4 border-b">Previous Qty</th>
                                <th className="py-2 px-4 border-b">Counted Qty</th>
                                <th className="py-2 px-4 border-b">Difference</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedStockCount.items.map((item, index) => {
                                let differenceBgColor = '';
                                if (item.difference < 0) {
                                  differenceBgColor = 'bg-red-100';
                                } else if (item.difference > 0) {
                                  differenceBgColor = 'bg-yellow-100';
                                } else {
                                  differenceBgColor = 'bg-green-100';
                                }

                                return (
                                  <tr key={item.rawGoodId} className="hover:bg-gray-50">
                                    <td className="py-2 px-4 border-b text-center">{index + 1}</td>
                                    <td className="py-2 px-4 border-b text-center">{item.name}</td>
                                    <td className="py-2 px-4 border-b text-center">
                                      {item.qtyOnHand.toFixed(2)}{' '}
                                      {getUnitAbbreviation(item.unitOfMeasure)}
                                    </td>
                                    <td className="py-2 px-4 border-b text-center">
                                      {item.countedQuantity.toFixed(2)}{' '}
                                      {getUnitAbbreviation(item.unitOfMeasure)}
                                    </td>
                                    <td
                                      className={`py-2 px-4 border-b text-center ${differenceBgColor}`}
                                    >
                                      {item.difference.toFixed(2)}{' '}
                                      {getUnitAbbreviation(item.unitOfMeasure)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p>Select a stock count to view details.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default StockCount;
