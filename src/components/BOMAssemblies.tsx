import React, { useState, useEffect, useRef } from 'react';
import Layout from './Layout';
import { Trash2, Edit2, Plus, Filter, ArrowUp, ArrowDown } from 'lucide-react';
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
  getDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import dayjs from 'dayjs';

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
  timestamp: number;
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

interface BOMChange {
  totalCostChange: 'increase' | 'decrease' | null;
  profitChange: 'increase' | 'decrease' | null;
  salesPriceChange: 'increase' | 'decrease' | null;
  timestamp: number;
}

const initialBOMAssembly: BOMAssemblyForm = {
  finishedProductName: '',
  articleNumber: '',
  date: dayjs().format('DD.MM.YYYY HH:mm:ss'),
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

  // Filtreleme ve sıralama için state'ler
  const [filterPopupVisible, setFilterPopupVisible] = useState<{ [key: string]: boolean }>({});
  const [filters, setFilters] = useState<{ [key: string]: any }>({});
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'ascending' | 'descending';
  } | null>(null);
  const filterTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const previousRawGoods = useRef<RawGood[]>([]);

  // BOM assembly değişim durumları
  const [bomChanges, setBOMChanges] = useState<{ [id: string]: BOMChange }>({});

  // Önceki BOM Assemblies'i izlemek için
  const previousBomAssemblies = useRef<BOMAssembly[]>([]);

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
          const assemblies = querySnapshot.docs.map((doc) => {
            const data = doc.data() as BOMAssembly;
            return {
              id: doc.id,
              ...data,
              date: data.date || dayjs().format('DD.MM.YYYY HH:mm:ss'),
            };
          });
          setBOMAssemblies(assemblies);
          setLoading(false);
        });

        // Raw Goods'i çekiyoruz ve dinleyici ekliyoruz
        const rawGoodsRef = collection(db, 'rawGoods');
        const rawGoodsQuery = query(rawGoodsRef, where('userId', '==', auth.currentUser.uid));

        const unsubscribeRawGoods = onSnapshot(rawGoodsQuery, async (querySnapshot) => {
          const updatedRawGoods = querySnapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() } as RawGood)
          );

          // Önceki ve güncel rawGoods'ları karşılaştırıyoruz
          if (previousRawGoods.current.length > 0) {
            for (const updatedRawGood of updatedRawGoods) {
              const previousRawGood = previousRawGoods.current.find(
                (rg) => rg.id === updatedRawGood.id
              );

              if (
                previousRawGood &&
                updatedRawGood.lastCostOfUnitOfMeasure !== previousRawGood.lastCostOfUnitOfMeasure
              ) {
                // lastCostOfUnitOfMeasure değişti
                await updateBOMAssembliesForRawGood(updatedRawGood);
              }
            }
          }

          // previousRawGoods'u güncelliyoruz
          previousRawGoods.current = updatedRawGoods;

          // rawGoods state'ini güncelliyoruz
          setRawGoods(updatedRawGoods);
        });

        // Other Costs'i çekiyoruz
        const otherCostsRef = collection(db, 'otherCosts');
        const otherCostsSnapshot = await getDocs(otherCostsRef);
        const otherCostsData = otherCostsSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as OtherCost)
        );
        setOtherCosts(otherCostsData);

        return () => {
          unsubscribeRawGoods();
        };
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

  // BOM Assemblies değişikliklerini izleyip bomChanges state'ini güncelle
  useEffect(() => {
    if (previousBomAssemblies.current.length > 0) {
      const oneDay = 24 * 60 * 60 * 1000;
      const changes: { [id: string]: BOMChange } = {};

      bomAssemblies.forEach((assembly) => {
        const prevAssembly = previousBomAssemblies.current.find((a) => a.id === assembly.id);
        if (prevAssembly) {
          const currentTime = Date.now();
          const existingChange = bomChanges[assembly.id];

          // Değişim durumlarını belirliyoruz
          let totalCostChange: 'increase' | 'decrease' | null = null;
          if (assembly.totalCost > prevAssembly.totalCost) {
            totalCostChange = 'increase';
          } else if (assembly.totalCost < prevAssembly.totalCost) {
            totalCostChange = 'decrease';
          } else if (existingChange) {
            totalCostChange = existingChange.totalCostChange;
          }

          let profitChange: 'increase' | 'decrease' | null = null;
          if (assembly.profitPerItem > prevAssembly.profitPerItem) {
            profitChange = 'increase';
          } else if (assembly.profitPerItem < prevAssembly.profitPerItem) {
            profitChange = 'decrease';
          } else if (existingChange) {
            profitChange = existingChange.profitChange;
          }

          let salesPriceChange: 'increase' | 'decrease' | null = null;
          if (assembly.salesPrice > prevAssembly.salesPrice) {
            salesPriceChange = 'increase';
          } else if (assembly.salesPrice < prevAssembly.salesPrice) {
            salesPriceChange = 'decrease';
          } else if (existingChange) {
            salesPriceChange = existingChange.salesPriceChange;
          }

          // Zaman damgasını güncelliyoruz
          let timestamp = currentTime;
          if (existingChange && Date.now() - existingChange.timestamp < oneDay) {
            timestamp = existingChange.timestamp;
          }

          if (totalCostChange || profitChange || salesPriceChange) {
            changes[assembly.id] = {
              totalCostChange,
              profitChange,
              salesPriceChange,
              timestamp,
            };
          }
        }
      });

      setBOMChanges((prev) => ({ ...prev, ...changes }));
    }

    previousBomAssemblies.current = bomAssemblies;
  }, [bomAssemblies]);

  const updateBOMAssembliesForRawGood = async (updatedRawGood: RawGood) => {
    try {
      const bomAssembliesRef = collection(db, 'bomAssemblies');
      const q = query(bomAssembliesRef, where('userId', '==', auth.currentUser!.uid));
      const bomAssembliesSnapshot = await getDocs(q);

      const bomAssembliesToUpdate: BOMAssembly[] = [];

      bomAssembliesSnapshot.forEach((doc) => {
        const bomAssembly = { id: doc.id, ...doc.data() } as BOMAssembly;

        const assemblyItemIndex = bomAssembly.assemblyItems.findIndex(
          (item) => item.name === updatedRawGood.name && item.itemType === 'Raw Goods'
        );

        if (assemblyItemIndex !== -1) {
          // Bu BOM Assembly, güncellenen raw good'u kullanıyor
          const assemblyItem = bomAssembly.assemblyItems[assemblyItemIndex];

          // purchaseCost ve totalCost güncellemesi
          assemblyItem.purchaseCost = updatedRawGood.lastCostOfUnitOfMeasure;
          assemblyItem.totalCost = assemblyItem.quantity * assemblyItem.purchaseCost;

          // BOM Assembly totalCost, profitPerItem, profitPercentagePerItem güncellemesi
          const totalCost = bomAssembly.assemblyItems.reduce(
            (sum, item) => sum + item.totalCost,
            0
          );
          const profitPerItem = bomAssembly.salesPrice - totalCost;
          const profitPercentagePerItem =
            bomAssembly.salesPrice > 0 ? (profitPerItem / bomAssembly.salesPrice) * 100 : 0;

          // Tarih ve timestamp güncellemesi
          const currentDate = dayjs().format('DD.MM.YYYY HH:mm:ss');
          const timestamp = Date.now();

          bomAssembly.assemblyItems[assemblyItemIndex] = assemblyItem;
          bomAssembly.totalCost = totalCost;
          bomAssembly.profitPerItem = profitPerItem;
          bomAssembly.profitPercentagePerItem = profitPercentagePerItem;
          bomAssembly.date = currentDate;
          bomAssembly.timestamp = timestamp;

          bomAssembliesToUpdate.push(bomAssembly);
        }
      });

      // Veritabanını güncelle
      for (const bomAssembly of bomAssembliesToUpdate) {
        const bomAssemblyRef = doc(db, 'bomAssemblies', bomAssembly.id);

        // Güncellemeden önce mevcut veriyi history koleksiyonuna ekleyelim
        const bomAssemblySnapshot = await getDoc(bomAssemblyRef);
        if (bomAssemblySnapshot.exists()) {
          const existingData = bomAssemblySnapshot.data();

          // Mevcut veriyi history koleksiyonuna ekliyoruz
          await addDoc(collection(db, 'bomAssembliesHistory'), {
            ...existingData,
            bomAssemblyId: bomAssembly.id,
            timestamp: existingData.timestamp || Date.now(),
            userId: auth.currentUser!.uid,
          });
        }

        // BOM Assembly'yi güncelliyoruz
        await updateDoc(bomAssemblyRef, bomAssembly);
      }

      // Yerel state'i güncelle
      setBOMAssemblies((prevBOMAssemblies) =>
        prevBOMAssemblies.map((bomAssembly) => {
          const updatedBOMAssembly = bomAssembliesToUpdate.find((ba) => ba.id === bomAssembly.id);
          if (updatedBOMAssembly) {
            return { ...bomAssembly, ...updatedBOMAssembly };
          }
          return bomAssembly;
        })
      );
    } catch (error) {
      console.error('Error updating BOM Assemblies: ', error);
    }
  };

  const calculateTotals = (
    assemblyItems: BOMAssemblyItem[] = newBOMAssembly.assemblyItems.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
    })),
    salesPrice: number = parseFloat(newBOMAssembly.salesPrice) || 0
  ) => {
    const totalCost = assemblyItems.reduce((sum, item) => sum + item.totalCost, 0);
    const profitPerItem = salesPrice - totalCost;
    const profitPercentagePerItem = salesPrice > 0 ? (profitPerItem / salesPrice) * 100 : 0;

    setNewBOMAssembly((prev) => ({
      ...prev,
      totalCost,
      profitPerItem,
      profitPercentagePerItem,
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewBOMAssembly((prev) => {
      const updatedBOMAssembly = {
        ...prev,
        [name]: value,
      };

      if (name === 'salesPrice') {
        const salesPriceValue = parseFloat(value) || 0;
        calculateTotals(
          updatedBOMAssembly.assemblyItems.map((item) => ({
            ...item,
            quantity: Number(item.quantity),
          })),
          salesPriceValue
        );
      }

      return updatedBOMAssembly;
    });
  };

  const handleAssemblyItemChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
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
    } else if (name === 'quantity') {
      const quantityValue = parseFloat(value) || 0;
      const totalCost = quantityValue * newAssemblyItem.purchaseCost;
      setNewAssemblyItem((prev) => ({
        ...prev,
        quantity: value,
        totalCost: totalCost,
      }));
      calculateTotals();
    }
  };

  const addAssemblyItem = () => {
    const quantity = parseFloat(newAssemblyItem.quantity) || 0;
    const purchaseCost = newAssemblyItem.purchaseCost;
    const totalCost = quantity * purchaseCost;

    const updatedItem: BOMAssemblyItem = {
      name: newAssemblyItem.name,
      itemType: newAssemblyItem.itemType,
      quantity: quantity,
      unitOfMeasure: newAssemblyItem.unitOfMeasure,
      purchaseCost: purchaseCost,
      totalCost: totalCost,
    };

    let updatedAssemblyItems: BOMAssemblyItem[];

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      calculateTotals();

      const salesPrice = parseFloat(newBOMAssembly.salesPrice) || 0;

      const bomData: Omit<BOMAssembly, 'id'> = {
        finishedProductName: newBOMAssembly.finishedProductName,
        articleNumber: newBOMAssembly.articleNumber,
        date: dayjs().format('DD.MM.YYYY HH:mm:ss'),
        salesDescription: newBOMAssembly.salesDescription,
        salesPrice,
        totalCost: newBOMAssembly.totalCost,
        profitPerItem: newBOMAssembly.profitPerItem,
        profitPercentagePerItem: newBOMAssembly.profitPercentagePerItem,
        assemblyItems: newBOMAssembly.assemblyItems.map((item) => ({
          ...item,
          quantity: Number(item.quantity), // Number olarak ayarlıyoruz
        })),
        timestamp: Date.now(),
      };

      if (editingBOMAssembly) {
        const bomAssemblyRef = doc(db, 'bomAssemblies', editingBOMAssembly);

        // Güncellemeden önce mevcut veriyi alıyoruz
        const bomAssemblySnapshot = await getDoc(bomAssemblyRef);
        if (bomAssemblySnapshot.exists()) {
          const existingData = bomAssemblySnapshot.data();

          // Mevcut veriyi history koleksiyonuna ekliyoruz
          await addDoc(collection(db, 'bomAssembliesHistory'), {
            ...existingData,
            bomAssemblyId: editingBOMAssembly,
            timestamp: existingData.timestamp || Date.now(),
            userId: auth.currentUser.uid,
          });
        }

        // Güncelleme işlemi
        await updateDoc(bomAssemblyRef, {
          ...bomData,
          userId: auth.currentUser.uid,
        });
      } else {
        // Yeni BOM Assembly ekleme işlemi
        const newDocRef = await addDoc(collection(db, 'bomAssemblies'), {
          ...bomData,
          userId: auth.currentUser.uid,
        });

        // İlk versiyonu history koleksiyonuna ekliyoruz
        await addDoc(collection(db, 'bomAssembliesHistory'), {
          ...bomData,
          bomAssemblyId: newDocRef.id,
          userId: auth.currentUser.uid,
        });
      }

      // State ve localStorage'ı sıfırlıyoruz
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

  const isRecentChange = (id: string) => {
    const change = bomChanges[id];
    if (change && change.timestamp) {
      const oneDay = 24 * 60 * 60 * 1000;
      return Date.now() - change.timestamp < oneDay;
    }
    return false;
  };

  const ChangeArrow = ({
    id,
    type,
  }: {
    id: string;
    type: 'salesPriceChange' | 'profitChange' | 'totalCostChange';
  }) => {
    const change = bomChanges[id];
    if (change && isRecentChange(id) && change[type]) {
      const isIncrease = change[type] === 'increase';
      const ArrowIcon = isIncrease ? ArrowUp : ArrowDown;
      const colorClass =
        type === 'salesPriceChange'
          ? isIncrease
            ? 'text-green-500'
            : 'text-red-500'
          : isIncrease
          ? 'text-red-500'
          : 'text-green-500';
      return <ArrowIcon className={`inline ml-1 ${colorClass}`} size={16} />;
    }
    return null;
  };

  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        {userLoggedIn === false ? (
          <p className="text-red-500">Please log in to view and manage BOM assemblies.</p>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <div className="grid grid-cols-2 gap-8">
                <div className="bg-blue-100 p-4 rounded-lg">
                  <h2 className="text-xl font-semibold mb-4">BOM Details</h2>
                  <form onSubmit={handleSubmit}>
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
                          type="text"
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
                      onClick={handleSubmit}
                      className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
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
                        onChange={(e) => {
                          setSelectedItemType(
                            e.target.value as 'Raw Goods' | 'Other Costs' | 'Finished Product'
                          );
                          setNewAssemblyItem((prev) => ({
                            ...prev,
                            itemType: e.target.value as
                              | 'Raw Goods'
                              | 'Other Costs'
                              | 'Finished Product',
                            name: '',
                            unitOfMeasure: '',
                            purchaseCost: 0,
                          }));
                        }}
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

              <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
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
                          <th className="py-2 px-4 border-b text-center">ID</th>
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
                        {filteredAssemblies.map((assembly, index) => (
                          <tr
                            key={assembly.id}
                            className={`hover:bg-gray-50 cursor-pointer ${
                              isRecentChange(assembly.id) ? 'bg-red-100' : ''
                            }`}
                            onClick={() => handleSelectBOMAssembly(assembly)}
                          >
                            <td className="py-2 px-4 border-b text-center">{index + 1}</td>
                            <td className="py-2 px-4 border-b text-center">
                              {assembly.finishedProductName}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {assembly.articleNumber}
                            </td>
                            <td className="py-2 px-4 border-b text-center">{assembly.date}</td>
                            <td className="py-2 px-4 border-b text-center">
                              {assembly.salesDescription}
                              <ChangeArrow id={assembly.id} type="salesPriceChange" />
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              €{(assembly.salesPrice || 0).toFixed(2)}
                              <ChangeArrow id={assembly.id} type="salesPriceChange" />
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              €{(assembly.totalCost || 0).toFixed(2)}
                              <ChangeArrow id={assembly.id} type="totalCostChange" />
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {(assembly.profitPercentagePerItem || 0).toFixed(2)}%
                              <ChangeArrow id={assembly.id} type="profitChange" />
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
                        ))}
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
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default BOMAssemblies;
