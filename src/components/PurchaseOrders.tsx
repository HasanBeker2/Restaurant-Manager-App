import React, { useState, useEffect, useRef } from 'react';
import Layout from './Layout';
import { Download, Trash2, Edit2, Plus, Filter } from 'lucide-react';
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
  orderBy,
  onSnapshot,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isBetween from 'dayjs/plugin/isBetween'; // isBetween eklentisini import ettik

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween); // isBetween eklentisini dayjs'e ekledik

interface PurchaseOrdersProps {
  logo: string;
  restaurantName: string;
}

interface PurchaseOrder {
  id: string;
  date: Timestamp;
  formattedDate: string;
  invoiceNumber: string;
  product: string;
  supplier: string;
  quantity: number;
  quantityUoM: number;
  costOfUnit: number;
  costOfUnitOfMeasure: number;
  purchUnitQty: number;
  unitOfMeasure: string;
  purchaseUnit: string;
  totalCost: number;
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

interface TempProduct {
  product: string;
  quantity: number;
  costOfUnit: number;
  costOfUnitOfMeasure: number;
  purchUnitQty: number;
  unitOfMeasure: string;
  purchaseUnit: string;
  totalCost: number;
}

const initialPurchaseOrderHeader = {
  date: dayjs().format('YYYY-MM-DDTHH:mm'),
  supplier: '',
  invoiceNumber: '',
};

const initialProduct = {
  product: '',
  quantity: 0,
  costOfUnit: 0,
  purchUnitQty: 0,
  unitOfMeasure: '',
  purchaseUnit: '',
  totalCost: 0,
  costOfUnitOfMeasure: 0,
};

const PurchaseOrders: React.FC<PurchaseOrdersProps> = ({
  logo,
  restaurantName,
}) => {
  const [purchaseOrderList, setPurchaseOrderList] = useState<PurchaseOrder[]>([]);
  const [purchaseOrderHeader, setPurchaseOrderHeader] = useState(
    initialPurchaseOrderHeader
  );
  const [tempProducts, setTempProducts] = useState<TempProduct[]>([]);
  const [showProductForm, setShowProductForm] = useState(false);
  const [currentProduct, setCurrentProduct] =
    useState<TempProduct>(initialProduct);
  const [editingProductIndex, setEditingProductIndex] = useState<number | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLoggedIn, setUserLoggedIn] = useState<boolean | null>(null);
  const [inputErrors, setInputErrors] = useState<{ [key: string]: string }>({});
  const [rawGoodsList, setRawGoodsList] = useState<RawGood[]>([]);
  const [supplierList, setSupplierList] = useState<string[]>([]);
  const [productError, setProductError] = useState<string>('');

  // Filtreleme ve sıralama için state'ler
  const [filterPopupVisible, setFilterPopupVisible] = useState<{ [key: string]: boolean }>({});
  const [filters, setFilters] = useState<{ [key: string]: any }>({});
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'ascending' | 'descending';
  } | null>(null);

  // Tarih aralığı filtreleri
  const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string }>({
    startDate: '',
    endDate: '',
  });

  const convertToBaseUnit = (quantity: number, unitOfMeasure: string): number => {
    if (unitOfMeasure === 'Kilograms' || unitOfMeasure === 'Litres') {
      return quantity * 1000;
    }
    return quantity;
  };

  const revertRawGoodsInventory = async (purchaseOrder: PurchaseOrder) => {
    try {
      const rawGood = rawGoodsList.find((rg) => rg.name === purchaseOrder.product);
      if (!rawGood) return;

      const adjustedPurchUnitQty = convertToBaseUnit(
        purchaseOrder.purchUnitQty,
        purchaseOrder.unitOfMeasure
      );

      const quantityToRevert = purchaseOrder.quantity * adjustedPurchUnitQty;

      const rawGoodRef = doc(db, 'rawGoods', rawGood.id);

      const purchaseOrdersRef = collection(db, 'purchaseOrders');
      const q = query(
        purchaseOrdersRef,
        where('userId', '==', auth.currentUser!.uid),
        where('product', '==', purchaseOrder.product),
        orderBy('date', 'desc')
      );
      const snapshot = await getDocs(q);

      let totalQuantity = 0;
      let totalValue = 0;
      let lastPurchaseOrder: PurchaseOrder | null = null;

      if (!snapshot.empty) {
        const purchaseOrders = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            if (doc.id === purchaseOrder.id) return null;

            return {
              id: doc.id,
              date: data.date,
              quantity: Number(data.quantity),
              costOfUnit: Number(data.costOfUnit),
              costOfUnitOfMeasure: Number(data.costOfUnitOfMeasure),
              purchUnitQty: Number(data.purchUnitQty),
              unitOfMeasure: data.unitOfMeasure,
            } as PurchaseOrder;
          })
          .filter((po) => po !== null) as PurchaseOrder[];

        if (purchaseOrders.length > 0) {
          lastPurchaseOrder = purchaseOrders[0];

          for (const po of purchaseOrders) {
            const adjustedPurchUnitQty = convertToBaseUnit(
              po.purchUnitQty,
              po.unitOfMeasure
            );
            const poQuantity = po.quantity * adjustedPurchUnitQty;
            const poValue = poQuantity * po.costOfUnitOfMeasure;

            totalQuantity += poQuantity;
            totalValue += poValue;
          }
        }
      }

      const newQtyOnHand = rawGood.qtyOnHand - quantityToRevert;
      const newAverageCost = totalQuantity > 0 ? totalValue / totalQuantity : 0;

      const updatedData: Partial<RawGood> = {
        qtyOnHand: newQtyOnHand,
        averageCostOfUnitOfMeasure: newAverageCost,
        date: Timestamp.now(),
      };

      if (lastPurchaseOrder) {
        updatedData.lastCostOfUnit = lastPurchaseOrder.costOfUnit;
        updatedData.lastCostOfUnitOfMeasure =
          lastPurchaseOrder.costOfUnitOfMeasure;
      } else {
        updatedData.lastCostOfUnit = 0;
        updatedData.lastCostOfUnitOfMeasure = 0;
      }

      await updateDoc(rawGoodRef, updatedData);

      setRawGoodsList((prevList) =>
        prevList.map((rg) =>
          rg.id === rawGood.id
            ? {
                ...rg,
                qtyOnHand: newQtyOnHand,
                averageCostOfUnitOfMeasure: newAverageCost,
                lastCostOfUnit: updatedData.lastCostOfUnit,
                lastCostOfUnitOfMeasure: updatedData.lastCostOfUnitOfMeasure,
                date: Timestamp.now(),
              }
            : rg
        )
      );
    } catch (error) {
      console.error('Error reverting raw goods inventory:', error);
      setError('Failed to revert raw goods inventory. Please try again.');
      throw error;
    }
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserLoggedIn(true);
      } else {
        setUserLoggedIn(false);
        setLoading(false);
        setError(
          'No user logged in. Please log in to view purchase orders.'
        );
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let unsubscribePurchaseOrders: () => void;

    const fetchData = async () => {
      if (!auth.currentUser) return;

      try {
        const purchaseOrdersRef = collection(db, 'purchaseOrders');
        const q = query(
          purchaseOrdersRef,
          where('userId', '==', auth.currentUser.uid),
          orderBy('date', 'desc'),
          orderBy('product')
        );

        unsubscribePurchaseOrders = onSnapshot(q, (querySnapshot) => {
          const purchaseOrders = querySnapshot.docs.map((doc) => {
            const data = doc.data();
            let formattedDate = '';

            if (data.date) {
              formattedDate = dayjs(data.date.toDate()).format(
                'DD.MM.YYYY HH:mm'
              );
            } else {
              formattedDate = 'N/A';
            }

            const quantity = Number(data.quantity) || 0;
            const purchUnitQty = Number(data.purchUnitQty) || 0;
            const quantityUoM = quantity * purchUnitQty;
            const safeQuantityUoM = isNaN(quantityUoM) ? 0 : quantityUoM;

            return {
              id: doc.id,
              date: data.date,
              formattedDate: formattedDate,
              invoiceNumber: data.invoiceNumber || '',
              product: data.product || '',
              supplier: data.supplier || '',
              quantity: quantity,
              quantityUoM: safeQuantityUoM,
              costOfUnit: Number(data.costOfUnit) || 0,
              costOfUnitOfMeasure: Number(data.costOfUnitOfMeasure) || 0,
              purchUnitQty: purchUnitQty,
              unitOfMeasure: data.unitOfMeasure || '',
              purchaseUnit: data.purchaseUnit || '',
              totalCost: Number(data.totalCost) || 0,
            } as PurchaseOrder;
          });

          setPurchaseOrderList(purchaseOrders);
          setLoading(false);
        });

        const rawGoodsRef = collection(db, 'rawGoods');
        const rawGoodsSnapshot = await getDocs(
          query(rawGoodsRef, where('userId', '==', auth.currentUser.uid))
        );
        const rawGoods = rawGoodsSnapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name || '',
          qtyOnHand: Number(doc.data().qtyOnHand) || 0,
          averageCostOfUnitOfMeasure:
            Number(doc.data().averageCostOfUnitOfMeasure) || 0,
          lastCostOfUnitOfMeasure:
            Number(doc.data().lastCostOfUnitOfMeasure) || 0,
          lastCostOfUnit: Number(doc.data().lastCostOfUnit) || 0,
          unitOfMeasure: doc.data().unitOfMeasure || '',
          purchaseUnit: doc.data().purchaseUnit || '',
          costOfUnit: Number(doc.data().costOfUnit) || 0,
          purchUnitQty: Number(doc.data().purchUnitQty) || 0,
          date: doc.data().date,
        }));
        setRawGoodsList(rawGoods);

        const supplierRef = collection(db, 'suppliers');
        const supplierSnapshot = await getDocs(
          query(supplierRef, where('userId', '==', auth.currentUser.uid))
        );
        const supplierNames = supplierSnapshot.docs.map(
          (doc) => doc.data().name || ''
        );
        setSupplierList(supplierNames);
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
      if (unsubscribePurchaseOrders) {
        unsubscribePurchaseOrders();
      }
    };
  }, [userLoggedIn]);

  const handleProductInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === 'product' && value) {
      if (checkDuplicateProduct(value) && editingProductIndex === null) {
        setProductError('This product is already added to the current order');
        return;
      } else {
        setProductError('');
      }

      const selectedRawGood = rawGoodsList.find((rg) => rg.name === value);
      if (selectedRawGood) {
        setCurrentProduct((prev) => ({
          ...prev,
          product: value,
          unitOfMeasure: selectedRawGood.unitOfMeasure,
          purchaseUnit: selectedRawGood.purchaseUnit,
          costOfUnit: selectedRawGood.costOfUnit,
          purchUnitQty: selectedRawGood.purchUnitQty,
        }));
      }
    }

    if (
      name === 'quantity' ||
      name === 'costOfUnit' ||
      name === 'purchUnitQty'
    ) {
      if (isNaN(Number(value))) {
        setInputErrors({
          ...inputErrors,
          [name]: 'Please enter a valid number',
        });
      } else {
        setInputErrors({ ...inputErrors, [name]: '' });
      }

      const newValues = {
        ...currentProduct,
        [name]: Number(value),
      };

      const quantity =
        name === 'quantity' ? Number(value) : Number(currentProduct.quantity);
      const costOfUnit =
        name === 'costOfUnit' ? Number(value) : Number(currentProduct.costOfUnit);
      const purchUnitQty =
        name === 'purchUnitQty'
          ? Number(value)
          : Number(currentProduct.purchUnitQty);

      newValues.totalCost = quantity * costOfUnit;
      const adjustedPurchUnitQty = convertToBaseUnit(
        purchUnitQty,
        currentProduct.unitOfMeasure
      );
      newValues.costOfUnitOfMeasure =
        adjustedPurchUnitQty > 0 ? costOfUnit / adjustedPurchUnitQty : 0;

      setCurrentProduct(newValues);
      return;
    }

    setCurrentProduct((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleHeaderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === 'date') {
      setPurchaseOrderHeader((prev) => ({
        ...prev,
        date: value,
      }));
    } else {
      setPurchaseOrderHeader((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const canAddProduct = () => {
    return (
      purchaseOrderHeader.date &&
      purchaseOrderHeader.supplier &&
      purchaseOrderHeader.invoiceNumber
    );
  };

  const checkDuplicateProduct = (product: string) => {
    return tempProducts.some((p) => p.product === product);
  };

  const handleAddOrUpdateProduct = () => {
    const purchUnitQty = Number(currentProduct.purchUnitQty);
    const adjustedPurchUnitQty = convertToBaseUnit(
      purchUnitQty,
      currentProduct.unitOfMeasure
    );

    const costOfUnitOfMeasure =
      adjustedPurchUnitQty !== 0
        ? Number(currentProduct.costOfUnit) / adjustedPurchUnitQty
        : 0;

    const newProduct: TempProduct = {
      ...currentProduct,
      quantity: Number(currentProduct.quantity) || 0,
      costOfUnit: Number(currentProduct.costOfUnit) || 0,
      purchUnitQty: purchUnitQty,
      totalCost:
        Number(currentProduct.quantity || 0) *
        Number(currentProduct.costOfUnit || 0),
      costOfUnitOfMeasure: costOfUnitOfMeasure,
    };

    if (editingProductIndex !== null) {
      setTempProducts((prev) =>
        prev.map((product, index) =>
          index === editingProductIndex ? newProduct : product
        )
      );
      setEditingProductIndex(null);
    } else {
      setTempProducts((prev) => [...prev, newProduct]);
    }

    setCurrentProduct(initialProduct);
    setShowProductForm(false);
    setProductError('');
  };

  const removeProduct = (index: number) => {
    setTempProducts((prev) => prev.filter((_, i) => i !== index));
    if (editingProductIndex === index) {
      setShowProductForm(false);
      setEditingProductIndex(null);
      setCurrentProduct(initialProduct);
      setProductError('');
    }
  };

  const calculateTotalOrderCost = () => {
    return tempProducts.reduce(
      (sum, product) => sum + (Number(product.totalCost) || 0),
      0
    );
  };

  const handleDelete = async (id: string) => {
    try {
      const purchaseOrder = purchaseOrderList.find((po) => po.id === id);
      if (purchaseOrder) {
        await revertRawGoodsInventory(purchaseOrder);
      }
      await deleteDoc(doc(db, 'purchaseOrders', id));
    } catch (error) {
      console.error('Error deleting purchase order: ', error);
      setError('Failed to delete purchase order. Please try again.');
    }
  };

  const updateRawGoodsInventory = async (products: TempProduct[]) => {
    try {
      for (const product of products) {
        const rawGood = rawGoodsList.find((rg) => rg.name === product.product);
        if (!rawGood) {
          console.error('Raw good not found');
          continue;
        }

        const adjustedPurchUnitQty = convertToBaseUnit(
          Number(product.purchUnitQty),
          product.unitOfMeasure
        );

        const newPurchaseQuantity =
          Number(product.quantity) * adjustedPurchUnitQty;
        const currentQuantity = Number(rawGood.qtyOnHand);
        const currentTotalValue =
          currentQuantity * Number(rawGood.averageCostOfUnitOfMeasure);
        const newPurchaseValue =
          newPurchaseQuantity * Number(product.costOfUnitOfMeasure);
        const totalQuantity = currentQuantity + newPurchaseQuantity;
        const newAverageCost =
          totalQuantity !== 0
            ? (currentTotalValue + newPurchaseValue) / totalQuantity
            : 0;

        const rawGoodRef = doc(db, 'rawGoods', rawGood.id);
        await updateDoc(rawGoodRef, {
          qtyOnHand: totalQuantity,
          averageCostOfUnitOfMeasure: newAverageCost,
          lastCostOfUnitOfMeasure: product.costOfUnitOfMeasure,
          lastCostOfUnit: product.costOfUnit,
          date: Timestamp.now(),
        });

        setRawGoodsList((prevList) =>
          prevList.map((rg) =>
            rg.id === rawGood.id
              ? {
                  ...rg,
                  qtyOnHand: totalQuantity,
                  averageCostOfUnitOfMeasure: newAverageCost,
                  lastCostOfUnitOfMeasure: product.costOfUnitOfMeasure,
                  lastCostOfUnit: product.costOfUnit,
                  date: Timestamp.now(),
                }
              : rg
          )
        );
      }
    } catch (error) {
      console.error('Error updating raw goods:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || tempProducts.length === 0) return;

    try {
      for (const product of tempProducts) {
        const purchaseOrderData = {
          ...purchaseOrderHeader,
          ...product,
          quantity: Number(product.quantity),
          costOfUnit: Number(product.costOfUnit),
          purchUnitQty: Number(product.purchUnitQty),
          totalCost: Number(product.totalCost),
          costOfUnitOfMeasure: Number(product.costOfUnitOfMeasure),
          date: Timestamp.fromDate(new Date(purchaseOrderHeader.date)),
          userId: auth.currentUser.uid,
        };

        await addDoc(collection(db, 'purchaseOrders'), purchaseOrderData);
      }

      await updateRawGoodsInventory(tempProducts);

      setPurchaseOrderHeader(initialPurchaseOrderHeader);
      setTempProducts([]);
      setShowProductForm(false);
      setCurrentProduct(initialProduct);
      setProductError('');
    } catch (error) {
      console.error('Error adding/updating purchase orders:', error);
      setError('Failed to save purchase orders. Please try again.');
    }
  };

  const handleEditProduct = (index: number) => {
    const productToEdit = tempProducts[index];
    setCurrentProduct(productToEdit);
    setEditingProductIndex(index);
    setShowProductForm(true);
    setProductError('');
  };

  const getUnitSuffix = (unitOfMeasure: string): string => {
    switch (unitOfMeasure) {
      case 'Grams':
        return 'gr';
      case 'Kilograms':
        return 'kg';
      case 'Milliliters':
        return 'ml';
      case 'Litres':
        return 'lt';
      case 'Count':
        return 'cnt';
      default:
        return '';
    }
  };

  const downloadPurchaseOrdersList = () => {
    try {
      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.text('Purchase Orders List', 14, 22);

      doc.setFontSize(12);
      doc.text(restaurantName, 14, 32);
      doc.text(`Date: ${dayjs().format('DD.MM.YYYY HH:mm')}`, 14, 38);

      const tableBody = purchaseOrderList.map((order, index) => [
        index + 1,
        order.formattedDate || '',
        order.invoiceNumber || '',
        order.product || '',
        order.supplier || '',
        `${order.quantity || 0} ${order.purchaseUnit || ''}`,
        `${isNaN(order.quantityUoM) ? '0.00' : order.quantityUoM.toFixed(2)} ${getUnitSuffix(
          order.unitOfMeasure || ''
        )}`,
        `€ ${(Number(order.costOfUnit) || 0).toFixed(2)}`,
        `€ ${(Number(order.costOfUnitOfMeasure) || 0).toFixed(4)}`,
        `€ ${(Number(order.totalCost) || 0).toFixed(2)}`,
      ]);

      (doc as any).autoTable({
        head: [
          [
            'Order ID',
            'Date',
            'Invoice #',
            'Raw Good',
            'Supplier',
            'Quantity',
            'Quantity (UoM)',
            'Cost (Unit)',
            'Cost (UoM)',
            'Total Cost',
          ],
        ],
        body: tableBody,
        startY: 45,
      });

      doc.save('purchase_orders_list.pdf');
    } catch (error) {
      console.error('Error generating PDF:', error);
      setError('Failed to generate PDF. Please try again.');
    }
  };

  // Filtreleme ve sıralama fonksiyonları
  const toggleFilterPopup = (key: string) => {
    setFilterPopupVisible((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
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
  };

  const applySorting = (key: string, direction: 'ascending' | 'descending') => {
    setSortConfig({ key, direction });
    setFilterPopupVisible((prev) => ({
      ...prev,
      [key]: false,
    }));
  };

  const resetFilters = () => {
    setFilters({});
    setSortConfig(null);
    setDateRange({ startDate: '', endDate: '' });
  };

  const getUniqueValues = (key: string) => {
    return Array.from(new Set(purchaseOrderList.map((item) => item[key])));
  };

  const isFilterActive = (key: string) => {
    if (filters[key]) return true;
    if (sortConfig?.key === key) return true;
    if (key === 'date' && dateRange.startDate && dateRange.endDate) return true;
    return false;
  };

  const handleDateRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDateRange((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const clearDateRangeFilter = () => {
    setDateRange({ startDate: '', endDate: '' });
    setFilterPopupVisible((prev) => ({
      ...prev,
      date: false,
    }));
  };

  const filteredPurchaseOrders = purchaseOrderList
    .filter((item) => {
      let isVisible = true;

      Object.keys(filters).forEach((key) => {
        if (filters[key]) {
          isVisible =
            isVisible &&
            item[key]?.toString().toLowerCase() === filters[key].toString().toLowerCase();
        }
      });

      if (dateRange.startDate && dateRange.endDate && item.date) {
        const itemDate = dayjs(item.date.toDate());
        const startDate = dayjs(dateRange.startDate);
        const endDate = dayjs(dateRange.endDate).endOf('day');
        isVisible =
          isVisible && itemDate.isBetween(startDate, endDate, null, '[]');
      }

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

  // Arka plan renkleri için renk dizisi
  const rowColors = [
    'bg-blue-100',
    'bg-green-100',
    'bg-yellow-100',
    'bg-pink-100',
    'bg-purple-100',
    'bg-indigo-100',
    'bg-teal-100',
    'bg-red-100',
    'bg-gray-100',
  ];

  // Fatura numarası ile renk eşleştirmesi
  const invoiceColorMap: { [key: string]: string } = {};
  let colorIndex = 0;

  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        {userLoggedIn === false ? (
          <p className="text-red-500">
            Please log in to view and manage purchase orders.
          </p>
        ) : (
          <>
            <div className="max-w-4xl mx-auto">
              <div className="bg-blue-500 rounded-lg shadow-lg p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4 text-white">
                  {editingProductIndex !== null
                    ? 'Update Product'
                    : 'New Purchase Order'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <label
                        htmlFor="date"
                        className="block text-sm font-medium text-white mb-1"
                      >
                        Date
                      </label>
                      <input
                        type="datetime-local"
                        name="date"
                        id="date"
                        value={purchaseOrderHeader.date}
                        onChange={handleHeaderChange}
                        className="w-full p-2 border rounded text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="invoiceNumber"
                        className="block text-sm font-medium text-white mb-1"
                      >
                        Invoice Number
                      </label>
                      <input
                        type="text"
                        name="invoiceNumber"
                        id="invoiceNumber"
                        value={purchaseOrderHeader.invoiceNumber}
                        onChange={handleHeaderChange}
                        placeholder="Invoice Number"
                        className="w-full p-2 border rounded text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="supplier"
                        className="block text-sm font-medium text-white mb-1"
                      >
                        Supplier
                      </label>
                      <select
                        name="supplier"
                        id="supplier"
                        value={purchaseOrderHeader.supplier}
                        onChange={handleHeaderChange}
                        className="w-full p-2 border rounded text-sm"
                        required
                      >
                        <option value="">Select Supplier</option>
                        {supplierList.map((supplier, index) => (
                          <option key={index} value={supplier}>
                            {supplier}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {canAddProduct() && !showProductForm && (
                    <button
                      type="button"
                      onClick={() => setShowProductForm(true)}
                      className="bg-white text-blue-500 px-4 py-2 rounded hover:bg-blue-100 flex items-center"
                    >
                      <Plus size={20} className="mr-2" />
                      Add Product
                    </button>
                  )}

                  {showProductForm && (
                    <div className="bg-white p-4 rounded-lg mt-4">
                      <h3 className="text-lg font-semibold mb-4 text-gray-800">
                        {editingProductIndex !== null
                          ? 'Update Product Details'
                          : 'Add Product Details'}
                      </h3>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label
                            htmlFor="product"
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            Product
                          </label>
                          <select
                            name="product"
                            id="product"
                            value={currentProduct.product}
                            onChange={handleProductInputChange}
                            className={`w-full p-2 border rounded text-sm ${
                              productError ? 'border-red-500' : ''
                            }`}
                            required
                          >
                            <option value="">Select Raw Good</option>
                            {rawGoodsList.map((product) => (
                              <option key={product.id} value={product.name}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                          {productError && (
                            <p className="text-red-500 text-xs mt-1">
                              {productError}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor="unitOfMeasure"
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            Unit of Measure
                          </label>
                          <select
                            name="unitOfMeasure"
                            id="unitOfMeasure"
                            value={currentProduct.unitOfMeasure}
                            onChange={handleProductInputChange}
                            className="w-full p-2 border rounded text-sm"
                            required
                          >
                            <option value="">Select Unit of Measure</option>
                            <option value="Grams">Grams</option>
                            <option value="Kilograms">Kilograms</option>
                            <option value="Milliliters">Milliliters</option>
                            <option value="Litres">Litres</option>
                            <option value="Count">Count</option>
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="purchaseUnit"
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            Purchase Unit
                          </label>
                          <select
                            name="purchaseUnit"
                            id="purchaseUnit"
                            value={currentProduct.purchaseUnit}
                            onChange={handleProductInputChange}
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

                      <div className="grid grid-cols-3 gap-4 mb-4">
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
                              name="quantity"
                              id="quantity"
                              value={currentProduct.quantity || ''}
                              onChange={handleProductInputChange}
                              className="w-full p-2 border rounded text-sm pr-16"
                              required
                            />
                            {currentProduct.purchaseUnit && (
                              <span className="absolute right-0 top-0 bottom-0 px-2 flex items-center bg-gray-200 rounded-r text-gray-700">
                                {currentProduct.purchaseUnit}
                              </span>
                            )}
                          </div>
                          {inputErrors.quantity && (
                            <p className="text-red-500 text-xs mt-1">
                              {inputErrors.quantity}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="purchUnitQty"
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            Purchase Unit Quantity
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              name="purchUnitQty"
                              id="purchUnitQty"
                              value={currentProduct.purchUnitQty || ''}
                              onChange={handleProductInputChange}
                              className="w-full p-2 border rounded text-sm pr-12"
                              required
                            />
                            {currentProduct.unitOfMeasure && (
                              <span className="absolute right-0 top-0 bottom-0 px-2 flex items-center bg-gray-200 rounded-r text-gray-700">
                                {getUnitSuffix(currentProduct.unitOfMeasure)}
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
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            Cost (Unit)
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              name="costOfUnit"
                              id="costOfUnit"
                              value={currentProduct.costOfUnit || ''}
                              onChange={handleProductInputChange}
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

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowProductForm(false);
                            setEditingProductIndex(null);
                            setCurrentProduct(initialProduct);
                            setProductError('');
                          }}
                          className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAddOrUpdateProduct}
                          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        >
                          {editingProductIndex !== null
                            ? 'Update Product'
                            : 'Add Product'}
                        </button>
                      </div>
                    </div>
                  )}

                  {tempProducts.length > 0 && (
                    <div className="mt-4 bg-white rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-2">
                        Products in Current Order
                      </h3>
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th
                              className="px-4 py-2 text-left"
                              style={{ width: '25%' }}
                            >
                              Product
                            </th>
                            <th
                              className="px-4 py-2 text-center"
                              style={{ width: '15%' }}
                            >
                              Quantity
                            </th>
                            <th
                              className="px-4 py-2 text-center"
                              style={{ width: '15%' }}
                            >
                              Quantity (UoM)
                            </th>
                            <th
                              className="px-4 py-2 text-center"
                              style={{ width: '15%' }}
                            >
                              Unit Cost
                            </th>
                            <th
                              className="px-4 py-2 text-center"
                              style={{ width: '20%' }}
                            >
                              Total Cost
                            </th>
                            <th
                              className="px-4 py-2 text-center"
                              style={{ width: '10%' }}
                            >
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {tempProducts.map((product, index) => (
                            <tr key={index}>
                              <td className="px-4 py-2 text-left">
                                {product.product}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {product.quantity} {product.purchaseUnit}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {(
                                  Number(product.quantity) *
                                  Number(product.purchUnitQty)
                                ).toFixed(2)}{' '}
                                {getUnitSuffix(product.unitOfMeasure)}
                              </td>
                              <td className="px-4 py-2 text-center">
                                €{(Number(product.costOfUnit) || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-center">
                                €{(Number(product.totalCost) || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleEditProduct(index)}
                                  className="text-blue-500 hover:text-blue-700 mr-2"
                                  title="Edit"
                                >
                                  <Edit2 size={18} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeProduct(index)}
                                  className="text-red-500 hover:text-red-700"
                                  title="Delete"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 font-semibold">
                            <td colSpan={4} className="px-4 py-2 text-right">
                              Total Order Cost:
                            </td>
                            <td className="px-4 py-2 text-center">
                              €{calculateTotalOrderCost().toFixed(2)}
                            </td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>

                      <button
                        type="submit"
                        className="mt-4 bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600"
                      >
                        Submit Purchase Order
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </div>

            <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4 overflow-x-auto">
              <h2 className="text-2xl font-semibold mb-4">
                Purchase Orders List
              </h2>
              {loading ? (
                <p>Loading purchase orders...</p>
              ) : error ? (
                <p className="text-red-500">{error}</p>
              ) : !purchaseOrderList?.length ? (
                <p>No purchase orders found. Add your first purchase order above.</p>
              ) : (
                <>
                  <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                      <tr>
                        {[
                          { key: 'id', label: 'Order ID' },
                          { key: 'date', label: 'Date' },
                          { key: 'invoiceNumber', label: 'Invoice #' },
                          { key: 'product', label: 'Raw Good' },
                          { key: 'supplier', label: 'Supplier' },
                          { key: 'quantity', label: 'Quantity' },
                          { key: 'quantityUoM', label: 'Quantity (UoM)' },
                          { key: 'costOfUnit', label: 'Cost (Unit)' },
                          { key: 'costOfUnitOfMeasure', label: 'Cost (UoM)' },
                          { key: 'totalCost', label: 'Total Cost' },
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
                                    isFilterActive(column.key)
                                      ? 'text-red-500'
                                      : 'text-gray-600'
                                  }`}
                                >
                                  <Filter size={16} />
                                </button>
                              )}
                            </div>
                            {filterPopupVisible[column.key] && (
                              <div className="absolute bg-white border rounded shadow p-2 mt-2 z-10">
                                {['quantity', 'quantityUoM', 'costOfUnit', 'costOfUnitOfMeasure', 'totalCost'].includes(
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
                                ) : column.key === 'date' ? (
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700">
                                      Start Date
                                    </label>
                                    <input
                                      type="date"
                                      name="startDate"
                                      value={dateRange.startDate}
                                      onChange={handleDateRangeChange}
                                      className="w-full p-2 border rounded text-sm mb-2"
                                    />
                                    <label className="block text-sm font-medium text-gray-700">
                                      End Date
                                    </label>
                                    <input
                                      type="date"
                                      name="endDate"
                                      value={dateRange.endDate}
                                      onChange={handleDateRangeChange}
                                      className="w-full p-2 border rounded text-sm mb-2"
                                    />
                                    <div className="flex justify-end mt-2">
                                      <button
                                        onClick={() => {
                                          setFilterPopupVisible((prev) => ({
                                            ...prev,
                                            date: false,
                                          }));
                                        }}
                                        className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
                                      >
                                        Apply
                                      </button>
                                      <button
                                        onClick={clearDateRangeFilter}
                                        className="bg-gray-500 text-white px-4 py-2 rounded"
                                      >
                                        Clear
                                      </button>
                                    </div>
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
                      {filteredPurchaseOrders.map((order, index) => {
                        // Fatura numarasına göre renk atama
                        const invoiceNumber = order.invoiceNumber;
                        if (!invoiceColorMap[invoiceNumber]) {
                          invoiceColorMap[invoiceNumber] =
                            rowColors[colorIndex % rowColors.length];
                          colorIndex++;
                        }
                        const rowColor = invoiceColorMap[invoiceNumber];

                        return (
                          <tr key={order.id} className={`hover:bg-gray-50 ${rowColor}`}>
                            <td className="py-2 px-4 border-b text-center">
                              {index + 1}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {order.formattedDate}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {order.invoiceNumber}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {order.product}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {order.supplier}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {order.quantity} {order.purchaseUnit}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              {isNaN(order.quantityUoM) ? '0.00' : order.quantityUoM.toFixed(2)}{' '}
                              {getUnitSuffix(order.unitOfMeasure)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              €{(Number(order.costOfUnit) || 0).toFixed(2)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              €{(Number(order.costOfUnitOfMeasure) || 0).toFixed(4)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              €{(Number(order.totalCost) || 0).toFixed(2)}
                            </td>
                            <td className="py-2 px-4 border-b text-center">
                              <button
                                onClick={() => handleDelete(order.id)}
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
                  {purchaseOrderList?.length > 0 && (
                    <>
                      <div className="mt-4 flex space-x-2">
                        <button
                          onClick={resetFilters}
                          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center"
                        >
                          Reset Filters
                        </button>
                        <button
                          onClick={downloadPurchaseOrdersList}
                          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 flex items-center"
                        >
                          <Download size={18} className="mr-2" />
                          Download Purchase Orders List (PDF)
                        </button>
                      </div>
                    </>
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

export default PurchaseOrders;
