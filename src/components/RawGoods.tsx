import React, { useState, useEffect, useRef } from 'react';
import Layout from './Layout';
import { Download, Trash2, Edit2, Filter } from 'lucide-react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
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
  orderBy,
  limit, // Burada limit fonksiyonunu import ediyoruz
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';

dayjs.extend(utc);
dayjs.extend(timezone);

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: AutoTableOptions) => jsPDF;
  }
}

interface AutoTableOptions {
  head: string[][];
  body: (string | number)[][];
  startY?: number;
  [key: string]: any;
}

interface RawGoodsProps {
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
  date?: Timestamp;
}

const RawGoods: React.FC<RawGoodsProps> = ({ logo, restaurantName }) => {
  const [rawGoodsList, setRawGoodsList] = useState<RawGood[]>([]);
  const [newRawGood, setNewRawGood] = useState<
    Omit<
      RawGood,
      | 'id'
      | 'averageCostOfUnitOfMeasure'
      | 'lastCostOfUnitOfMeasure'
      | 'date'
      | 'lastCostOfUnit'
    >
  >({
    name: '',
    qtyOnHand: 0,
    costOfUnit: 0,
    purchUnitQty: 0,
    unitOfMeasure: '',
    purchaseUnit: '',
  });
  const [rawGoodDate, setRawGoodDate] = useState<string>(getTodayDateString());
  const [editingRawGood, setEditingRawGood] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLoggedIn, setUserLoggedIn] = useState<boolean | null>(null);
  const [inputErrors, setInputErrors] = useState<{ [key: string]: string }>({});
  const [nameError, setNameError] = useState<string>('');

  // Filtreleme ve sıralama için state'ler
  const [filterPopupVisible, setFilterPopupVisible] = useState<{ [key: string]: boolean }>({});
  const [filters, setFilters] = useState<{ [key: string]: any }>({});
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'ascending' | 'descending';
  } | null>(null);
  const filterTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});

  // Get today's date in YYYY-MM-DD format
  function getTodayDateString() {
    return dayjs().format('YYYY-MM-DD');
  }

  // Helper function to determine if raw good was updated within last 24 hours
  const isRecentlyUpdated = (rawGood: RawGood): boolean => {
    if (!rawGood.date) return false;
    const purchaseDate = dayjs(rawGood.date.toDate());
    const now = dayjs();
    return now.diff(purchaseDate, 'hour') < 24;
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserLoggedIn(true);
      } else {
        setUserLoggedIn(false);
        setLoading(false);
        setError('No user logged in. Please log in to view raw goods.');
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let unsubscribeRawGoods: () => void;

    const fetchData = async () => {
      if (!auth.currentUser) return;

      try {
        const rawGoodsRef = collection(db, 'rawGoods');
        const q = query(
          rawGoodsRef,
          where('userId', '==', auth.currentUser.uid),
          orderBy('date', 'desc')
        );

        unsubscribeRawGoods = onSnapshot(q, (querySnapshot) => {
          const rawGoods = querySnapshot.docs.map((doc) => {
            const data = doc.data() as Omit<RawGood, 'id'>;
            return {
              id: doc.id,
              ...data,
              date: data.date || Timestamp.fromDate(new Date()),
            } as RawGood;
          });
          setRawGoodsList(rawGoods);
          setLoading(false);
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

    resetFilters();

    return () => {
      if (unsubscribeRawGoods) unsubscribeRawGoods();
    };
  }, [userLoggedIn]);

  const checkDuplicateName = async (name: string) => {
    if (!auth.currentUser) return false;

    const rawGoodsRef = collection(db, 'rawGoods');
    const q = query(
      rawGoodsRef,
      where('userId', '==', auth.currentUser.uid),
      where('name', '==', name)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  };

  const handleInputChange = async (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === 'name' && value) {
      const isDuplicate = await checkDuplicateName(value);
      if (isDuplicate && !editingRawGood) {
        setNameError('This product already exists');
        return;
      } else {
        setNameError('');
      }
    }

    if (
      name === 'qtyOnHand' ||
      name === 'costOfUnit' ||
      name === 'purchUnitQty'
    ) {
      if (isNaN(Number(value))) {
        setInputErrors({
          ...inputErrors,
          [name]: 'Please enter a valid number',
        });
      } else {
        setInputErrors({
          ...inputErrors,
          [name]: '',
        });
      }
    }

    if (name === 'date') {
      setRawGoodDate(value);
    } else {
      setNewRawGood((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // Convert units functions
  const convertToBaseUnit = (
    quantity: number,
    unitOfMeasure: string
  ): number => {
    if (unitOfMeasure === 'Kilograms') {
      return quantity * 1000;
    } else if (unitOfMeasure === 'Liters') {
      return quantity * 1000;
    }
    return quantity;
  };

  const convertFromBaseUnit = (
    quantity: number,
    unitOfMeasure: string
  ): number => {
    if (unitOfMeasure === 'Kilograms' || unitOfMeasure === 'Liters') {
      return quantity / 1000;
    }
    return quantity;
  };

  const getUnitAbbreviation = (unitOfMeasure: string) => {
    switch (unitOfMeasure) {
      case 'Grams':
        return 'gr';
      case 'Kilograms':
        return 'kg';
      case 'Milliliters':
        return 'ml';
      case 'Liters':
        return 'lt';
      case 'Count':
        return 'cnt';
      default:
        return '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    if (
      Object.values(inputErrors).some((error) => error !== '') ||
      nameError ||
      !rawGoodDate
    ) {
      setError('Please correct the errors before submitting.');
      return;
    }

    try {
      const costOfUnit = Number(newRawGood.costOfUnit);
      const purchUnitQty = convertToBaseUnit(
        Number(newRawGood.purchUnitQty),
        newRawGood.unitOfMeasure
      );
      const qtyOnHand = convertToBaseUnit(
        Number(newRawGood.qtyOnHand),
        newRawGood.unitOfMeasure
      );

      const costPerBaseUnit =
        purchUnitQty !== 0 ? costOfUnit / purchUnitQty : 0;

      const rawGoodData: Omit<RawGood, 'id'> = {
        ...newRawGood,
        qtyOnHand,
        purchUnitQty,
        costOfUnit,
        averageCostOfUnitOfMeasure: costPerBaseUnit,
        date: Timestamp.fromDate(new Date(rawGoodDate)),
      };

      if (editingRawGood) {
        const rawGoodRef = doc(db, 'rawGoods', editingRawGood);

        // Fetch the last purchase order for this raw good
        const purchaseOrdersRef = collection(db, 'purchaseOrders');
        const q = query(
          purchaseOrdersRef,
          where('userId', '==', auth.currentUser.uid),
          where('product', '==', newRawGood.name),
          orderBy('date', 'desc'),
          limit(1)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const lastPurchaseOrder = snapshot.docs[0].data();
          const lastCostOfUnit = lastPurchaseOrder.costOfUnit;
          const lastCostPerBaseUnit =
            purchUnitQty !== 0 ? lastCostOfUnit / purchUnitQty : 0;

          rawGoodData.lastCostOfUnit = lastCostOfUnit;
          rawGoodData.lastCostOfUnitOfMeasure = lastCostPerBaseUnit;
        } else {
          // No purchase orders, set last cost to current cost
          rawGoodData.lastCostOfUnit = costOfUnit;
          rawGoodData.lastCostOfUnitOfMeasure = costPerBaseUnit;
        }

        await updateDoc(rawGoodRef, rawGoodData);
      } else {
        // Yeni ham madde eklerken
        rawGoodData.lastCostOfUnit = costOfUnit;
        rawGoodData.lastCostOfUnitOfMeasure = costPerBaseUnit;

        await addDoc(collection(db, 'rawGoods'), {
          ...rawGoodData,
          userId: auth.currentUser.uid,
        });
      }

      setNewRawGood({
        name: '',
        qtyOnHand: 0,
        costOfUnit: 0,
        purchUnitQty: 0,
        unitOfMeasure: '',
        purchaseUnit: '',
      });
      setRawGoodDate(getTodayDateString());
      setEditingRawGood(null);
      setNameError('');
      setError(null);
    } catch (error) {
      console.error('Error adding/updating raw good: ', error);
      setError('Failed to save raw good. Please try again.');
    }
  };

  const handleEdit = (rawGood: RawGood) => {
    const {
      averageCostOfUnitOfMeasure,
      lastCostOfUnitOfMeasure,
      lastCostOfUnit,
      date,
      ...editableFields
    } = rawGood;

    editableFields.qtyOnHand = convertFromBaseUnit(
      editableFields.qtyOnHand,
      editableFields.unitOfMeasure
    );
    editableFields.purchUnitQty = convertFromBaseUnit(
      editableFields.purchUnitQty,
      editableFields.unitOfMeasure
    );

    setNewRawGood(editableFields);
    setRawGoodDate(
      date ? dayjs(date.toDate()).format('YYYY-MM-DD') : getTodayDateString()
    );
    setEditingRawGood(rawGood.id);
    setNameError('');
    setError(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'rawGoods', id));
    } catch (error) {
      console.error('Error deleting raw good: ', error);
      setError('Failed to delete raw good. Please try again.');
    }
  };

  const displayQuantity = (quantity: number, unitOfMeasure: string) => {
    const displayQty = convertFromBaseUnit(quantity, unitOfMeasure);
    return `${displayQty.toFixed(2)} ${getUnitAbbreviation(unitOfMeasure)}`;
  };

  const downloadRawGoodsList = () => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Raw Goods List', 14, 22);

    doc.setFontSize(12);
    doc.text(`${restaurantName}`, 14, 32);
    doc.text(`Date: ${dayjs().format('DD.MM.YYYY')}`, 14, 38);

    (doc as any).autoTable({
      head: [
        [
          'ID',
          'Date',
          'Name',
          'Qty On Hand',
          'Cost (Unit)',
          'Avg Cost (UoM)',
          'Last Cost (Unit)',
          'Last Cost (UoM)',
          'Purch. Unit Qty',
          'UoM',
          'Purchase Unit',
        ],
      ],
      body: rawGoodsList.map((rawGood, index) => [
        index + 1,
        rawGood.date ? dayjs(rawGood.date.toDate()).format('DD.MM.YYYY') : 'N/A',
        rawGood.name,
        displayQuantity(rawGood.qtyOnHand, rawGood.unitOfMeasure),
        `€${rawGood.costOfUnit.toFixed(2)}`,
        `€${(rawGood.averageCostOfUnitOfMeasure || 0).toFixed(4)}`,
        rawGood.lastCostOfUnit ? `€${rawGood.lastCostOfUnit.toFixed(2)}` : 'N/A',
        `€${(rawGood.lastCostOfUnitOfMeasure || 0).toFixed(4)}`,
        displayQuantity(rawGood.purchUnitQty, rawGood.unitOfMeasure),
        rawGood.unitOfMeasure,
        rawGood.purchaseUnit,
      ]),
      startY: 45,
    });

    doc.save('raw_goods_list.pdf');
  };

  // Filtreleme ve sıralama fonksiyonları
  const toggleFilterPopup = (key: string) => {
    setFilterPopupVisible((prev) => {
      if (prev[key] && filterTimers.current[key]) {
        clearTimeout(filterTimers.current[key]);
      }
      return {
        ...prev,
        [key]: !prev[key],
      };
    });

    if (!filterPopupVisible[key]) {
      filterTimers.current[key] = setTimeout(() => {
        setFilterPopupVisible((prev) => ({
          ...prev,
          [key]: false,
        }));
      }, 3000);
    }
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
    setFilterPopupVisible((prev) => ({
      ...prev,
      [key]: false,
    }));
    if (filterTimers.current[key]) {
      clearTimeout(filterTimers.current[key]);
    }
  };

  const applySorting = (key: string, direction: 'ascending' | 'descending') => {
    setSortConfig({ key, direction });
    setFilterPopupVisible((prev) => ({
      ...prev,
      [key]: false,
    }));
    if (filterTimers.current[key]) {
      clearTimeout(filterTimers.current[key]);
    }
  };

  const resetFilters = () => {
    setFilters({});
    setSortConfig(null);
  };

  const getUniqueValues = (key: string) => {
    if (key === 'date') {
      // Tarihleri formatlayarak benzersiz değerleri alıyoruz
      return Array.from(
        new Set(
          rawGoodsList.map((item) =>
            item.date ? dayjs(item.date.toDate()).format('DD.MM.YYYY') : 'N/A'
          )
        )
      );
    } else {
      return Array.from(new Set(rawGoodsList.map((item) => item[key])));
    }
  };

  const isFilterActive = (key: string) => {
    return filters[key];
  };

  const filteredRawGoods = rawGoodsList
    .filter((item) => {
      let isVisible = true;

      Object.keys(filters).forEach((key) => {
        if (filters[key]) {
          if (key === 'date') {
            const itemDate = item.date
              ? dayjs(item.date.toDate()).format('DD.MM.YYYY')
              : 'N/A';
            isVisible =
              isVisible &&
              itemDate.toLowerCase() === filters[key].toString().toLowerCase();
          } else if (typeof filters[key] === 'string') {
            isVisible =
              isVisible &&
              item[key]?.toString().toLowerCase() === filters[key].toString().toLowerCase();
          }
        }
      });

      return isVisible;
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      let aValue = a[key];
      let bValue = b[key];

      if (key === 'date') {
        aValue = a.date ? a.date.toDate() : null;
        bValue = b.date ? b.date.toDate() : null;
      }

      if (aValue < bValue || aValue === null) {
        return direction === 'ascending' ? -1 : 1;
      }
      if (aValue > bValue || bValue === null) {
        return direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });

  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        {userLoggedIn === false ? (
          <p className="text-red-500">
            Please log in to view and manage raw goods.
          </p>
        ) : (
          <>
            <div className="max-w-4xl mx-auto">
              <div className="bg-blue-500 rounded-lg shadow-lg p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4 text-white">
                  {editingRawGood !== null ? 'Edit' : 'Add New'} Raw Good
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="name"
                        className="block text-sm font-medium text-white mb-1"
                      >
                        Name
                      </label>
                      <input
                        type="text"
                        name="name"
                        id="name"
                        value={newRawGood.name}
                        onChange={handleInputChange}
                        placeholder="Enter raw good name"
                        className={`w-full p-2 border rounded text-sm ${
                          nameError ? 'border-red-500' : ''
                        }`}
                        required
                      />
                      {nameError && (
                        <p className="text-red-500 text-xs mt-1">{nameError}</p>
                      )}
                    </div>
                    <div>
                      <label
                        htmlFor="date"
                        className="block text-sm font-medium text-white mb-1"
                      >
                        Date
                      </label>
                      <input
                        type="date"
                        name="date"
                        id="date"
                        value={rawGoodDate}
                        onChange={handleInputChange}
                        className="w-full p-2 border rounded text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="unitOfMeasure"
                        className="block text-sm font-medium text-white mb-1"
                      >
                        Unit of Measure
                      </label>
                      <select
                        name="unitOfMeasure"
                        value={newRawGood.unitOfMeasure}
                        onChange={handleInputChange}
                        className="w-full p-2 border rounded text-sm"
                        required
                      >
                        <option value="">Select Unit of Measure</option>
                        <option value="Grams">Grams</option>
                        <option value="Kilograms">Kilograms</option>
                        <option value="Milliliters">Milliliters</option>
                        <option value="Liters">Liters</option>
                        <option value="Count">Count</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="purchaseUnit"
                        className="block text-sm font-medium text-white mb-1"
                      >
                        Purchase Unit
                      </label>
                      <select
                        name="purchaseUnit"
                        value={newRawGood.purchaseUnit}
                        onChange={handleInputChange}
                        className="w-full p-2 border rounded text-sm"
                        required
                      >
                        <option value="">Select Purchase Unit</option>
                        <option value="Bag">Bag</option>
                        <option value="Carton">Carton</option>
                        <option value="Bottle">Bottle</option>
                        <option value="Box">Box</option>
                        <option value="Each">Each</option>
                        <option value="Tub">Tub</option>
                        <option value="Packet">Packet</option>
                        <option value="Stick">Stick</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label
                        htmlFor="qtyOnHand"
                        className="block text-sm font-medium text-white mb-1"
                      >
                        Quantity On Hand
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          id="qtyOnHand"
                          name="qtyOnHand"
                          value={newRawGood.qtyOnHand}
                          onChange={handleInputChange}
                          className="w-full p-2 border rounded text-sm pr-12"
                          required
                        />
                        {newRawGood.unitOfMeasure && (
                          <span className="absolute right-0 top-0 bottom-0 px-2 flex items-center bg-gray-200 rounded-r text-gray-700">
                            {getUnitAbbreviation(newRawGood.unitOfMeasure)}
                          </span>
                        )}
                      </div>
                      {inputErrors.qtyOnHand && (
                        <p className="text-red-500 text-xs mt-1">
                          {inputErrors.qtyOnHand}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="purchUnitQty"
                        className="block text-sm font-medium text-white mb-1"
                      >
                        Purchase Unit Quantity
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          id="purchUnitQty"
                          name="purchUnitQty"
                          value={newRawGood.purchUnitQty}
                          onChange={handleInputChange}
                          className="w-full p-2 border rounded text-sm pr-12"
                          required
                        />
                        {newRawGood.unitOfMeasure && (
                          <span className="absolute right-0 top-0 bottom-0 px-2 flex items-center bg-gray-200 rounded-r text-gray-700">
                            {getUnitAbbreviation(newRawGood.unitOfMeasure)}
                          </span>
                        )}
                      </div>
                      {inputErrors.purchUnitQty && (
                        <p className="text-red-500 text-xs mt-1">
                          {inputErrors.purchUnitQty}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="costOfUnit"
                        className="block text-sm font-medium text-white mb-1"
                      >
                        Cost (Unit)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          id="costOfUnit"
                          name="costOfUnit"
                          value={newRawGood.costOfUnit}
                          onChange={handleInputChange}
                          className="w-full p-2 border rounded text-sm pr-8"
                          required
                        />
                        <span className="absolute right-0 top-0 bottom-0 px-2 flex items-center bg-gray-200 rounded-r text-gray-700">
                          €
                        </span>
                      </div>
                      {inputErrors.costOfUnit && (
                        <p className="text-red-500 text-xs mt-1">
                          {inputErrors.costOfUnit}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="bg-white text-blue-500 px-6 py-2 rounded hover:bg-blue-100 text-sm font-medium"
                  >
                    {editingRawGood !== null ? 'Update' : 'Add'} Raw Good
                  </button>
                </form>
              </div>
            </div>

            <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4 overflow-x-auto">
              <h2 className="text-2xl font-semibold mb-4">Raw Goods List</h2>
              {loading ? (
                <p>Loading raw goods...</p>
              ) : error ? (
                <p className="text-red-500">{error}</p>
              ) : rawGoodsList.length === 0 ? (
                <p>No raw goods found. Add your first raw good above.</p>
              ) : (
                <>
                  <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                      <tr>
                        {/* Sütunları yeniden düzenliyoruz */}
                        {[
                          { key: 'id', label: 'ID' },
                          { key: 'date', label: 'Date' },
                          { key: 'name', label: 'Name' },
                          { key: 'qtyOnHand', label: 'Qty On Hand' },
                          { key: 'costOfUnit', label: 'Cost (Unit)' },
                          { key: 'averageCostOfUnitOfMeasure', label: 'Average Cost (UoM)' },
                          { key: 'lastCostOfUnit', label: 'Last Cost (Unit)' },
                          { key: 'lastCostOfUnitOfMeasure', label: 'Last Cost (UoM)' },
                          { key: 'purchUnitQty', label: 'Purch. Unit Qty' },
                          { key: 'unitOfMeasure', label: 'Unit of Measure' },
                          { key: 'purchaseUnit', label: 'Purchase Unit' },
                        ].map((column) => (
                          <th
                            key={column.key}
                            className="py-2 px-4 border-b text-center relative"
                          >
                            <div className="flex items-center justify-center">
                              {column.label}
                              {column.key !== 'id' && (
                                <button
                                  onClick={() => toggleFilterPopup(column.key)}
                                  className={`ml-2 hover:text-gray-800 ${
                                    isFilterActive(column.key) ? 'text-red-500' : 'text-gray-600'
                                  }`}
                                >
                                  <Filter size={16} />
                                </button>
                              )}
                            </div>
                            {filterPopupVisible[column.key] && (
                              <div className="absolute bg-white border rounded shadow p-2 mt-2 z-10">
                                {[
                                  'qtyOnHand',
                                  'costOfUnit',
                                  'averageCostOfUnitOfMeasure',
                                  'lastCostOfUnit',
                                  'lastCostOfUnitOfMeasure',
                                  'purchUnitQty',
                                ].includes(column.key) ? (
                                  <div>
                                    <button
                                      onClick={() => applySorting(column.key, 'ascending')}
                                      className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-100"
                                    >
                                      Sort Ascending
                                    </button>
                                    <button
                                      onClick={() => applySorting(column.key, 'descending')}
                                      className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-100"
                                    >
                                      Sort Descending
                                    </button>
                                  </div>
                                ) : (
                                  <div>
                                    {getUniqueValues(column.key).map((value, idx) => (
                                      <div key={idx} className="flex items-center mb-1">
                                        <input
                                          type="checkbox"
                                          checked={filters[column.key] === value}
                                          onChange={() => handleFilterChange(column.key, value)}
                                          className="mr-2"
                                        />
                                        <label className="text-sm">{value}</label>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </th>
                        ))}
                        {/* "Actions" sütununu en sona taşıyoruz */}
                        <th className="py-2 px-4 border-b">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRawGoods.map((rawGood, index) => {
                        const recentlyUpdated = isRecentlyUpdated(rawGood);
                        return (
                          <tr
                            key={rawGood.id}
                            className={`hover:bg-gray-50 ${
                              recentlyUpdated ? 'bg-red-100' : ''
                            }`}
                          >
                            <td className="py-2 px-4 border-b text-center">
                              {index + 1}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {rawGood.date
                                ? dayjs(rawGood.date.toDate()).format(
                                    'DD.MM.YYYY'
                                  )
                                : 'N/A'}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {rawGood.name}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {displayQuantity(
                                rawGood.qtyOnHand,
                                rawGood.unitOfMeasure
                              )}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              €{rawGood.costOfUnit.toFixed(2)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              €
                              {(
                                rawGood.averageCostOfUnitOfMeasure || 0
                              ).toFixed(4)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {rawGood.lastCostOfUnit
                                ? `€${rawGood.lastCostOfUnit.toFixed(2)}`
                                : 'N/A'}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              €
                              {(
                                rawGood.lastCostOfUnitOfMeasure || 0
                              ).toFixed(4)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {displayQuantity(
                                rawGood.purchUnitQty,
                                rawGood.unitOfMeasure
                              )}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {rawGood.unitOfMeasure}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {rawGood.purchaseUnit}
                            </td>
                            {/* "Actions" sütununu en sona taşıyoruz */}
                            <td className="py-2 px-4 border-b text-center">
                              <button
                                onClick={() => handleEdit(rawGood)}
                                className="text-blue-500 hover:text-blue-700 mr-2"
                                title="Edit"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                onClick={() => handleDelete(rawGood.id)}
                                className="text-red-500 hover:text-red-700"
                                title="Delete"
                              >
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {rawGoodsList.length > 0 && (
                    <div className="mt-4 flex space-x-2">
                      <button
                        onClick={resetFilters}
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center"
                      >
                        Reset Filters
                      </button>
                      <button
                        onClick={downloadRawGoodsList}
                        className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 flex items-center"
                      >
                        <Download size={18} className="mr-2" />
                        Download Raw Goods List (PDF)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default RawGoods;
