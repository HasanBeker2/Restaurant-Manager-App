// BOMAssemblies.tsx

import React, { useState, useEffect, useRef } from 'react';
import Layout from './Layout';
import { Trash2, Edit2, Plus, Filter, Info } from 'lucide-react';
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
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import Tooltip from './Tooltip'; // Tooltip bileşeninizin doğru konumda olduğundan emin olun
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface BOMAssembliesProps {
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
  assemblyItems: BOMAssemblyItem[];
  userId: string;
}

interface BOMAssemblyItem {
  name: string;
  itemType: 'Raw Goods' | 'Other Costs' | 'Finished Product';
  quantity: number;
  unitOfMeasure: string;
  purchaseCost: number;
  totalCost: number;
}

interface RawGood {
  id: string;
  name: string;
  unitOfMeasure: string;
  lastCostOfUnitOfMeasure: number;
}

interface OtherCost {
  id: string;
  name: string;
  unit: string;
  cost: number;
}

interface BOMAssemblyForm {
  id?: string;
  finishedProductName: string;
  articleNumber: string;
  date: string;
  salesDescription: string;
  salesPrice: string;
  totalCost: number;
  profitPerItem: number;
  profitPercentagePerItem: number;
  assemblyItems: BOMAssemblyItemForm[];
}

interface BOMAssemblyItemForm {
  name: string;
  itemType: 'Raw Goods' | 'Other Costs' | 'Finished Product';
  quantity: string;
  unitOfMeasure: string;
  purchaseCost: number;
  totalCost: number;
}

const initialBOMAssembly: BOMAssemblyForm = {
  finishedProductName: '',
  articleNumber: '',
  date: new Date().toISOString().split('T')[0],
  salesDescription: '',
  salesPrice: '',
  totalCost: 0,
  profitPerItem: 0,
  profitPercentagePerItem: 0,
  assemblyItems: [],
};

const BOMAssemblies: React.FC<BOMAssembliesProps> = ({ logo, restaurantName }) => {
  const [bomAssemblies, setBOMAssemblies] = useState<BOMAssembly[]>([]);
  const [newBOMAssembly, setNewBOMAssembly] = useState<BOMAssemblyForm>(() => {
    const savedBOMAssembly = localStorage.getItem('newBOMAssembly');
    return savedBOMAssembly
      ? { ...initialBOMAssembly, ...JSON.parse(savedBOMAssembly) }
      : initialBOMAssembly;
  });
  const [editingBOMAssembly, setEditingBOMAssembly] = useState<string | null>(null);
  const [selectedBOMAssembly, setSelectedBOMAssembly] = useState<BOMAssembly | null>(null);
  const [costHistory, setCostHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLoggedIn, setUserLoggedIn] = useState<boolean | null>(null);
  const [rawGoods, setRawGoods] = useState<RawGood[]>([]);
  const [otherCosts, setOtherCosts] = useState<OtherCost[]>([]);
  const [selectedItemType, setSelectedItemType] = useState<
    'Raw Goods' | 'Other Costs' | 'Finished Product'
  >('Raw Goods');
  const [newAssemblyItem, setNewAssemblyItem] = useState<BOMAssemblyItemForm>({
    name: '',
    itemType: 'Raw Goods',
    quantity: '',
    unitOfMeasure: '',
    purchaseCost: 0,
    totalCost: 0,
  });
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [filterPopupVisible, setFilterPopupVisible] = useState<{ [key: string]: boolean }>({});
  const [filters, setFilters] = useState<{ [key: string]: any }>({});
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'ascending' | 'descending';
  } | null>(null);
  const filterTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const [showPriceModal, setShowPriceModal] = useState<boolean>(false);
  const [priceToUpdate, setPriceToUpdate] = useState<number>(0);
  const [currentUpdateBOMId, setCurrentUpdateBOMId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserLoggedIn(true);
      } else {
        setUserLoggedIn(false);
        setLoading(false);
        setError('No user logged in. Please log in to view BOM assemblies.');
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let unsubscribeBOMAssemblies: () => void;

    const fetchData = async () => {
      if (!auth.currentUser) return;

      try {
        const bomAssembliesRef = collection(db, 'bomAssemblies');
        const q = query(bomAssembliesRef, where('userId', '==', auth.currentUser.uid));

        unsubscribeBOMAssemblies = onSnapshot(q, (querySnapshot) => {
          const assemblies = querySnapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() } as BOMAssembly)
          );
          setBOMAssemblies(assemblies);
          setLoading(false);
        });

        // Raw Goods'i çekiyoruz
        const rawGoodsRef = collection(db, 'rawGoods');
        const rawGoodsSnapshot = await getDocs(rawGoodsRef);
        const rawGoodsData = rawGoodsSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as RawGood)
        );
        setRawGoods(rawGoodsData);

        // Other Costs'i çekiyoruz
        const otherCostsRef = collection(db, 'otherCosts');
        const otherCostsSnapshot = await getDocs(otherCostsRef);
        const otherCostsData = otherCostsSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as OtherCost)
        );
        setOtherCosts(otherCostsData);
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
      if (unsubscribeBOMAssemblies) unsubscribeBOMAssemblies();
    };
  }, [userLoggedIn]);

  // newBOMAssembly state'i değiştiğinde localStorage'a kaydedin
  useEffect(() => {
    localStorage.setItem('newBOMAssembly', JSON.stringify(newBOMAssembly));
  }, [newBOMAssembly]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewBOMAssembly((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAssemblyItemChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'name') {
      let selectedItem;
      if (selectedItemType === 'Raw Goods') {
        selectedItem = rawGoods.find((item) => item.name === value);
      } else if (selectedItemType === 'Other Costs') {
        selectedItem = otherCosts.find((item) => item.name === value);
      } else if (selectedItemType === 'Finished Product') {
        selectedItem = bomAssemblies.find((item) => item.finishedProductName === value);
      }

      if (selectedItem) {
        let unitOfMeasure =
          'unitOfMeasure' in selectedItem ? selectedItem.unitOfMeasure : selectedItem.unit || '';
        let purchaseCost =
          'lastCostOfUnitOfMeasure' in selectedItem
            ? selectedItem.lastCostOfUnitOfMeasure
            : selectedItem.cost || 0;

        // Raw Goods için birim dönüşümü ve birim fiyat hesaplaması
        if (selectedItemType === 'Raw Goods') {
          const unit = unitOfMeasure.toLowerCase();
          if (unit === 'kilograms') {
            unitOfMeasure = 'gr';
            purchaseCost = purchaseCost; // Gram başına fiyat
          } else if (unit === 'litres') {
            unitOfMeasure = 'ml';
            purchaseCost = purchaseCost; // Mililitre başına fiyat
          }
        }

        setNewAssemblyItem((prev) => ({
          ...prev,
          name: value,
          unitOfMeasure: unitOfMeasure,
          purchaseCost: purchaseCost,
          itemType: selectedItemType,
        }));
      }
    } else if (name === 'itemType') {
      setSelectedItemType(value as 'Raw Goods' | 'Other Costs' | 'Finished Product');
      setNewAssemblyItem((prev) => ({
        ...prev,
        itemType: value as 'Raw Goods' | 'Other Costs' | 'Finished Product',
        name: '',
        unitOfMeasure: '',
        purchaseCost: 0,
      }));
    } else {
      setNewAssemblyItem((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const addAssemblyItem = () => {
    const quantity = parseFloat(newAssemblyItem.quantity) || 0;
    const purchaseCost = newAssemblyItem.purchaseCost;
    const totalCost = quantity * purchaseCost;

    const updatedItem = { ...newAssemblyItem, totalCost, quantity };

    let updatedAssemblyItems;

    if (editingItemIndex !== null) {
      // Mevcut ürünü güncelle
      updatedAssemblyItems = newBOMAssembly.assemblyItems.map((item, index) =>
        index === editingItemIndex ? updatedItem : item
      );
    } else {
      // Yeni ürün ekle
      updatedAssemblyItems = [...newBOMAssembly.assemblyItems, updatedItem];
    }

    setNewBOMAssembly((prev) => ({
      ...prev,
      assemblyItems: updatedAssemblyItems,
    }));
    setNewAssemblyItem({
      name: '',
      itemType: 'Raw Goods',
      quantity: '',
      unitOfMeasure: '',
      purchaseCost: 0,
      totalCost: 0,
    });
    setEditingItemIndex(null);
    calculateTotals(updatedAssemblyItems);
  };

  const editAssemblyItem = (index: number) => {
    const item = newBOMAssembly.assemblyItems[index];
    setNewAssemblyItem({
      name: item.name,
      itemType: item.itemType,
      quantity: item.quantity.toString(),
      unitOfMeasure: item.unitOfMeasure,
      purchaseCost: item.purchaseCost,
      totalCost: item.totalCost,
    });
    setSelectedItemType(item.itemType);
    setEditingItemIndex(index);
  };

  const removeAssemblyItem = (index: number) => {
    const updatedAssemblyItems = newBOMAssembly.assemblyItems.filter((_, i) => i !== index);
    setNewBOMAssembly((prev) => ({
      ...prev,
      assemblyItems: updatedAssemblyItems,
    }));
    calculateTotals(updatedAssemblyItems);
  };

  const calculateTotals = (assemblyItems = newBOMAssembly.assemblyItems) => {
    const totalCost = assemblyItems.reduce((sum, item) => sum + item.totalCost, 0);
    const salesPrice = parseFloat(newBOMAssembly.salesPrice) || 0;

    const profitPerItem = salesPrice - totalCost;
    const profitPercentagePerItem = salesPrice > 0 ? (profitPerItem / salesPrice) * 100 : 0;

    setNewBOMAssembly((prev) => ({
      ...prev,
      totalCost,
      profitPerItem,
      profitPercentagePerItem,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      calculateTotals();

      const salesPrice = parseFloat(newBOMAssembly.salesPrice) || 0;
      const currentDate = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD" formatında

      const bomData: Omit<BOMAssembly, 'id'> = {
        finishedProductName: newBOMAssembly.finishedProductName,
        articleNumber: newBOMAssembly.articleNumber,
        date: currentDate, // Güncellenen tarihi yansıtma
        salesDescription: newBOMAssembly.salesDescription,
        salesPrice,
        totalCost: newBOMAssembly.totalCost,
        profitPerItem: newBOMAssembly.profitPerItem,
        profitPercentagePerItem: newBOMAssembly.profitPercentagePerItem,
        assemblyItems: newBOMAssembly.assemblyItems.map((item) => ({
          ...item,
          quantity: parseFloat(item.quantity.toString()) || 0,
        })),
        userId: auth.currentUser.uid,
      };

      if (editingBOMAssembly) {
        const bomAssemblyRef = doc(db, 'bomAssemblies', editingBOMAssembly);
        await updateDoc(bomAssemblyRef, bomData);
      } else {
        await addDoc(collection(db, 'bomAssemblies'), bomData);
      }

      // BOM başarıyla kaydedildikten sonra state'i sıfırlayın ve localStorage'ı temizleyin
      setNewBOMAssembly(initialBOMAssembly);
      localStorage.removeItem('newBOMAssembly');
      setEditingBOMAssembly(null);
      setSelectedBOMAssembly(null);
    } catch (error) {
      console.error('Error adding/updating BOM assembly: ', error);
      setError('Failed to save BOM assembly. Please try again.');
    }
  };

  const handleEdit = (bomAssembly: BOMAssembly) => {
    setNewBOMAssembly({
      finishedProductName: bomAssembly.finishedProductName,
      articleNumber: bomAssembly.articleNumber,
      date: bomAssembly.date,
      salesDescription: bomAssembly.salesDescription,
      salesPrice: bomAssembly.salesPrice.toString(),
      totalCost: bomAssembly.totalCost,
      profitPerItem: bomAssembly.profitPerItem,
      profitPercentagePerItem: bomAssembly.profitPercentagePerItem,
      assemblyItems: bomAssembly.assemblyItems.map((item) => ({
        ...item,
        quantity: item.quantity.toString(),
      })),
    });
    setEditingBOMAssembly(bomAssembly.id);
    setSelectedBOMAssembly(bomAssembly);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'bomAssemblies', id));
      setSelectedBOMAssembly(null);
    } catch (error) {
      console.error('Error deleting BOM assembly: ', error);
      setError('Failed to delete BOM assembly. Please try again.');
    }
  };

  const handleSelectBOMAssembly = (bomAssembly: BOMAssembly) => {
    setSelectedBOMAssembly(bomAssembly);
    setNewBOMAssembly({
      finishedProductName: bomAssembly.finishedProductName,
      articleNumber: bomAssembly.articleNumber,
      date: bomAssembly.date,
      salesDescription: bomAssembly.salesDescription,
      salesPrice: bomAssembly.salesPrice.toString(),
      totalCost: bomAssembly.totalCost,
      profitPerItem: bomAssembly.profitPerItem,
      profitPercentagePerItem: bomAssembly.profitPercentagePerItem,
      assemblyItems: bomAssembly.assemblyItems.map((item) => ({
        ...item,
        quantity: item.quantity.toString(),
      })),
    });
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
    return Array.from(new Set(bomAssemblies.map((assembly) => assembly[key])));
  };

  const filteredAssemblies = bomAssemblies
    .filter((assembly) => {
      let isVisible = true;

      Object.keys(filters).forEach((key) => {
        if (filters[key]) {
          if (typeof filters[key] === 'string') {
            isVisible =
              isVisible &&
              assembly[key]?.toString().toLowerCase() === filters[key].toString().toLowerCase();
          }
        }
      });

      return isVisible;
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      const aValue = a[key];
      const bValue = b[key];
      if (aValue < bValue) {
        return direction === 'ascending' ? -1 : 1;
      }
      if (aValue > bValue) {
        return direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });

  const isFilterActive = (key: string) => {
    return filters[key];
  };

  // Modal ile satış fiyatını güncelleme işlevleri
  const openPriceModal = (bomId: string, currentPrice: number) => {
    setCurrentUpdateBOMId(bomId);
    setPriceToUpdate(currentPrice);
    setShowPriceModal(true);
  };

  const closePriceModal = () => {
    setShowPriceModal(false);
    setCurrentUpdateBOMId(null);
    setPriceToUpdate(0);
  };

  const handlePriceUpdate = async () => {
    if (!currentUpdateBOMId) return;

    try {
      const bomDocRef = doc(db, 'bomAssemblies', currentUpdateBOMId);
      const bomDoc = await getDocs(query(bomDocRef));

      if (bomDoc.empty) {
        setError('BOM Assembly not found.');
        return;
      }

      const bomData = bomDoc.docs[0].data() as BOMAssembly;

      const newSalesPrice = parseFloat(priceToUpdate.toFixed(2));
      const newProfitPerItem = newSalesPrice - bomData.totalCost;
      const newProfitPercentagePerItem = newSalesPrice > 0 ? (newProfitPerItem / newSalesPrice) * 100 : 0;
      const currentDate = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD" formatında

      await updateDoc(bomDocRef, {
        salesPrice: newSalesPrice,
        profitPerItem: parseFloat(newProfitPerItem.toFixed(2)),
        profitPercentagePerItem: parseFloat(newProfitPercentagePerItem.toFixed(2)),
        date: currentDate, // Satış fiyatı güncellendiğinde tarihi de güncelle
      });

      // Firestore güncellemesi, Cloud Function tarafından tetiklenecek ve costHistory'ye kaydedilecek

      closePriceModal();
    } catch (error) {
      console.error('Error updating sales price: ', error);
      setError('Failed to update sales price. Please try again.');
    }
  };

  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        {userLoggedIn === false ? (
          <p className="text-red-500">Please log in to view and manage BOM assemblies.</p>
        ) : (
          <>
            {/* BOM Assembly Form */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <div className="grid grid-cols-2 gap-8">
                <div className="bg-blue-100 p-4 rounded-lg">
                  <h2 className="text-xl font-semibold mb-4">BOM Details</h2>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="finishedProductName"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Finished Product
                        </label>
                        <input
                          type="text"
                          id="finishedProductName"
                          name="finishedProductName"
                          value={newBOMAssembly.finishedProductName}
                          onChange={handleInputChange}
                          className="w-full p-2 border rounded text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="articleNumber"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Article Number
                        </label>
                        <input
                          type="text"
                          id="articleNumber"
                          name="articleNumber"
                          value={newBOMAssembly.articleNumber}
                          onChange={handleInputChange}
                          className="w-full p-2 border rounded text-sm"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="date"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Date
                        </label>
                        <input
                          type="date"
                          id="date"
                          name="date"
                          value={newBOMAssembly.date}
                          onChange={handleInputChange}
                          className="w-full p-2 border rounded text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="salesDescription"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Sales Description
                        </label>
                        <input
                          type="text"
                          id="salesDescription"
                          name="salesDescription"
                          value={newBOMAssembly.salesDescription}
                          onChange={handleInputChange}
                          className="w-full p-2 border rounded text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="salesPrice"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Sales Price
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            id="salesPrice"
                            name="salesPrice"
                            value={newBOMAssembly.salesPrice}
                            onChange={handleInputChange}
                            className="w-full p-2 border rounded text-sm"
                            required
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none bg-gray-100">
                            <span className="text-gray-500">€</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="totalCost"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Total Cost
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            id="totalCost"
                            name="totalCost"
                            value={(newBOMAssembly.totalCost || 0).toFixed(2)}
                            readOnly
                            className="w-full p-2 border rounded text-sm bg-gray-100"
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none bg-gray-100">
                            <span className="text-gray-500">€</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="profitPerItem"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Profit
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            id="profitPerItem"
                            name="profitPerItem"
                            value={(newBOMAssembly.profitPerItem || 0).toFixed(2)}
                            readOnly
                            className="w-full p-2 border rounded text-sm bg-gray-100"
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none bg-gray-100">
                            <span className="text-gray-500">€</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="profitPercentagePerItem"
                          className="block text-sm font-medium text-gray-700 mb-1"
                        >
                          Profit Percentage
                        </label>
                        <input
                          type="number"
                          step="any"
                          id="profitPercentagePerItem"
                          name="profitPercentagePerItem"
                          value={(newBOMAssembly.profitPercentagePerItem || 0).toFixed(2)}
                          readOnly
                          className="w-full p-2 border rounded text-sm bg-gray-100"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 text-sm font-medium"
                    >
                      {editingBOMAssembly ? 'Update BOM' : 'Add New BOM'}
                    </button>
                  </form>
                </div>
                <div className="bg-green-100 p-4 rounded-lg">
                  <h2 className="text-xl font-semibold mb-4">Add Assembly Items</h2>
                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="itemType"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Item Type
                      </label>
                      <select
                        id="itemType"
                        name="itemType"
                        value={selectedItemType}
                        onChange={handleAssemblyItemChange}
                        className="w-full p-2 border rounded text-sm"
                      >
                        <option value="Raw Goods">Raw Goods</option>
                        <option value="Other Costs">Other Costs</option>
                        <option value="Finished Product">Finished Product</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="itemName"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Item Name
                      </label>
                      <select
                        id="itemName"
                        name="name"
                        value={newAssemblyItem.name}
                        onChange={handleAssemblyItemChange}
                        className="w-full p-2 border rounded text-sm"
                      >
                        <option value="">Select Item</option>
                        {selectedItemType === 'Raw Goods'
                          ? rawGoods.map((item) => (
                              <option key={item.id} value={item.name}>
                                {item.name}
                              </option>
                            ))
                          : selectedItemType === 'Other Costs'
                          ? otherCosts.map((item) => (
                              <option key={item.id} value={item.name}>
                                {item.name}
                              </option>
                            ))
                          : bomAssemblies.map((item) => (
                              <option key={item.id} value={item.finishedProductName}>
                                {item.finishedProductName}
                              </option>
                            ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="quantity"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Quantity
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          id="quantity"
                          name="quantity"
                          value={newAssemblyItem.quantity}
                          onChange={handleAssemblyItemChange}
                          className="w-full p-2 border rounded text-sm"
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none bg-gray-100">
                          <span className="text-gray-500">{newAssemblyItem.unitOfMeasure}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor="purchaseCost"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Purchase Cost
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          id="purchaseCost"
                          name="purchaseCost"
                          value={(newAssemblyItem.purchaseCost || 0).toFixed(4)}
                          readOnly
                          className="w-full p-2 border rounded text-sm bg-gray-100"
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none bg-gray-100">
                          <span className="text-gray-500">€</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addAssemblyItem}
                      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center"
                    >
                      <Plus size={20} className="mr-2" />
                      {editingItemIndex !== null ? 'Update Item' : 'Add Item'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Assembly Items Table */}
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-2">BOM Assembly Items</h3>
                <table className="min-w-full bg-white">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="py-2 px-4 border-b text-center">Name</th>
                      <th className="py-2 px-4 border-b text-center">Item Type</th>
                      <th className="py-2 px-4 border-b text-center">Qty</th>
                      <th className="py-2 px-4 border-b text-center">Purch. Cost</th>
                      <th className="py-2 px-4 border-b text-center">Total Cost</th>
                      <th className="py-2 px-4 border-b text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newBOMAssembly.assemblyItems.map((item, index) => (
                      <tr key={index}>
                        <td className="py-2 px-4 border-b text-center">{item.name}</td>
                        <td className="py-2 px-4 border-b text-center">{item.itemType}</td>
                        <td className="py-2 px-4 border-b text-center">
                          {item.quantity} {item.unitOfMeasure}
                        </td>
                        <td className="py-2 px-4 border-b text-center">
                          €{(item.purchaseCost || 0).toFixed(4)}
                        </td>
                        <td className="py-2 px-4 border-b text-center">
                          €{(item.totalCost || 0).toFixed(2)}
                        </td>
                        <td className="py-2 px-4 border-b text-center">
                          <button
                            type="button"
                            onClick={() => editAssemblyItem(index)}
                            className="text-blue-500 hover:text-blue-700 mr-2"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAssemblyItem(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="py-2 px-4 border-t text-right font-semibold">
                        Total
                      </td>
                      <td className="py-2 px-4 border-t text-center">
                        €{(newBOMAssembly.totalCost || 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-4 border-t"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Finished Product List */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
              <h2 className="text-2xl font-semibold mb-4">Finished Product List</h2>
              {loading ? (
                <p>Loading finished products...</p>
              ) : error ? (
                <p className="text-red-500">{error}</p>
              ) : bomAssemblies.length === 0 ? (
                <p>No finished products found. Create your first BOM assembly above.</p>
              ) : (
                <>
                  <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="py-2 px-4 border-b text-center">#</th>
                        {[
                          { key: 'finishedProductName', label: 'Finished Product' },
                          { key: 'articleNumber', label: 'Article Number' },
                          { key: 'date', label: 'Date' },
                          { key: 'salesDescription', label: 'Sales Description' },
                          { key: 'salesPrice', label: 'Sales Price' },
                          { key: 'totalCost', label: 'Total Cost' },
                          { key: 'profitPercentagePerItem', label: 'Profit %' },
                        ].map((column) => (
                          <th
                            key={column.key}
                            className="py-2 px-4 border-b text-center relative"
                          >
                            <div className="flex items-center justify-center">
                              {column.label}
                              <button
                                onClick={() => toggleFilterPopup(column.key)}
                                className={`ml-2 hover:text-gray-800 ${
                                  isFilterActive(column.key) ? 'text-red-500' : 'text-gray-600'
                                }`}
                              >
                                <Filter size={16} />
                              </button>
                            </div>
                            {filterPopupVisible[column.key] && (
                              <div className="absolute bg-white border rounded shadow p-2 mt-2 z-10">
                                {['salesPrice', 'totalCost', 'profitPercentagePerItem'].includes(
                                  column.key
                                ) ? (
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
                        <th className="py-2 px-4 border-b text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssemblies.map((assembly, index) => {
                        const isUpdatedToday = assembly.date === new Date().toISOString().split('T')[0];
                        return (
                          <tr
                            key={assembly.id}
                            className={`hover:bg-gray-50 ${
                              isUpdatedToday ? 'bg-red-100' : ''
                            }`}
                          >
                            {isUpdatedToday && (
                              <td className="py-2 px-4 border-b text-center">
                                <Info
                                  size={18}
                                  className="text-blue-500 cursor-pointer"
                                  onClick={() => openPriceModal(assembly.id, assembly.salesPrice)}
                                  title="Update Price"
                                />
                              </td>
                            )}
                            {!isUpdatedToday && (
                              <td className="py-2 px-4 border-b text-center">#</td>
                            )}
                            <td className="py-2 px-4 border-b text-center">{assembly.finishedProductName}</td>
                            <td className="py-2 px-4 border-b text-center">{assembly.articleNumber}</td>
                            <td className="py-2 px-4 border-b text-center">{assembly.date}</td>
                            <td className="py-2 px-4 border-b text-center">{assembly.salesDescription}</td>
                            <td className="py-2 px-4 border-b text-center">
                              €{(assembly.salesPrice || 0).toFixed(2)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              €{(assembly.totalCost || 0).toFixed(2)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {(assembly.profitPercentagePerItem || 0).toFixed(2)}%
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(assembly);
                                }}
                                className="text-blue-500 hover:text-blue-700 mr-2"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(assembly.id);
                                }}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 size={18} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {bomAssemblies.length > 0 && (
                    <button
                      onClick={resetFilters}
                      className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center"
                    >
                      Reset Filters
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Price Update Modal */}
            {showPriceModal && (
              <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-20">
                <div className="bg-white rounded-lg shadow-lg p-6 w-96">
                  <h3 className="text-lg font-semibold mb-4">Update Sales Price</h3>
                  <div className="mb-4">
                    <label htmlFor="newSalesPrice" className="block text-sm font-medium text-gray-700 mb-1">
                      New Sales Price (€)
                    </label>
                    <input
                      type="number"
                      step="any"
                      id="newSalesPrice"
                      name="newSalesPrice"
                      value={priceToUpdate}
                      onChange={(e) => setPriceToUpdate(parseFloat(e.target.value))}
                      className="w-full p-2 border rounded text-sm"
                      required
                    />
                  </div>
                  <div className="flex justify-end space-x-4">
                    <button
                      onClick={closePriceModal}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePriceUpdate}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      Update
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default BOMAssemblies;
