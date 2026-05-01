"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/store/inventoryStore";
import type {
  ContactLensAttributes,
  FrameAttributes,
  Product,
  ProductCreatePayload,
  ProductType,
  ProductUpdatePayload,
} from "@/types/inventory";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Edit mode when present; create mode otherwise. */
  product?: Product;
  /** Required only in create mode (otherwise inferred from product). */
  productType?: ProductType;
  onSaved?: (product: Product) => void;
}

export function ProductFormModal({
  open,
  onClose,
  product,
  productType,
  onSaved,
}: Props) {
  const isEdit = !!product;
  const type: ProductType = product?.productType ?? productType ?? "frame";

  const createProduct = useInventoryStore((s) => s.createProduct);
  const updateProduct = useInventoryStore((s) => s.updateProduct);

  // Top-level fields
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [sku, setSku] = useState("");
  const [upc, setUpc] = useState("");
  const [retailPrice, setRetailPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [stockQty, setStockQty] = useState("0");
  const [reorderThreshold, setReorderThreshold] = useState("3");

  // Frame attributes (snake_case keys preserved at JSONB boundary)
  const [color, setColor] = useState("");
  const [eyeSize, setEyeSize] = useState("");
  const [bridgeSize, setBridgeSize] = useState("");
  const [templeSize, setTempleSize] = useState("");
  const [gender, setGender] = useState<NonNullable<FrameAttributes["gender"]>>("unisex");
  const [material, setMaterial] = useState<NonNullable<FrameAttributes["material"]>>("acetate");

  // Contact-lens attributes
  const [modality, setModality] = useState<ContactLensAttributes["modality"]>("daily");
  const [baseCurve, setBaseCurve] = useState("");
  const [diameter, setDiameter] = useState("");
  const [power, setPower] = useState("");
  const [boxSize, setBoxSize] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setBrand(product.brand);
      setModel(product.model);
      setSku(product.sku);
      setUpc(product.upc ?? "");
      setRetailPrice(String(product.retailPrice));
      setCostPrice(product.costPrice ?? "");
      setStockQty(String(product.stockQty));
      setReorderThreshold(String(product.reorderThreshold));
      const a = product.attributes as Record<string, unknown>;
      setColor(String(a.color ?? ""));
      setEyeSize(a.eye_size != null ? String(a.eye_size) : "");
      setBridgeSize(a.bridge_size != null ? String(a.bridge_size) : "");
      setTempleSize(a.temple_size != null ? String(a.temple_size) : "");
      setGender((a.gender as NonNullable<FrameAttributes["gender"]>) ?? "unisex");
      setMaterial((a.material as NonNullable<FrameAttributes["material"]>) ?? "acetate");
      setModality((a.modality as ContactLensAttributes["modality"]) ?? "daily");
      setBaseCurve(a.base_curve != null ? String(a.base_curve) : "");
      setDiameter(a.diameter != null ? String(a.diameter) : "");
      setPower(a.power != null ? String(a.power) : "");
      setBoxSize(a.box_size != null ? String(a.box_size) : "");
    } else {
      setBrand("");
      setModel("");
      setSku("");
      setUpc("");
      setRetailPrice("");
      setCostPrice("");
      setStockQty("0");
      setReorderThreshold("3");
      setColor("");
      setEyeSize("");
      setBridgeSize("");
      setTempleSize("");
      setGender("unisex");
      setMaterial("acetate");
      setModality("daily");
      setBaseCurve("");
      setDiameter("");
      setPower("");
      setBoxSize("");
    }
    setError(null);
  }, [open, product]);

  function buildAttributes(): Record<string, unknown> {
    if (type === "frame") {
      return {
        brand,
        model,
        color: color || undefined,
        eye_size: eyeSize ? Number(eyeSize) : undefined,
        bridge_size: bridgeSize ? Number(bridgeSize) : undefined,
        temple_size: templeSize ? Number(templeSize) : undefined,
        gender,
        material,
      };
    }
    return {
      brand,
      modality,
      base_curve: baseCurve ? Number(baseCurve) : undefined,
      diameter: diameter ? Number(diameter) : undefined,
      power: power ? Number(power) : undefined,
      box_size: boxSize ? Number(boxSize) : undefined,
    };
  }

  async function handleSubmit() {
    setError(null);
    if (!brand.trim() || !model.trim()) {
      setError("Brand and Model are required.");
      return;
    }
    if (!retailPrice) {
      setError("Retail price is required.");
      return;
    }
    if (type === "frame" && !eyeSize) {
      setError("Eye size is required for frames.");
      return;
    }
    if (type === "contact_lens" && (!baseCurve || !diameter || !power)) {
      setError("Base curve, diameter, and power are required for contact lenses.");
      return;
    }

    setSubmitting(true);
    try {
      const attributes = buildAttributes();
      let saved: Product;
      if (isEdit && product) {
        const payload: ProductUpdatePayload = {
          brand,
          model,
          upc: upc || null,
          retailPrice,
          costPrice: costPrice || null,
          reorderThreshold: Number(reorderThreshold),
          attributes,
        };
        saved = await updateProduct(product.id, payload);
      } else {
        const payload: ProductCreatePayload = {
          productType: type,
          brand,
          model,
          sku: sku || undefined,
          upc: upc || null,
          attributes,
          retailPrice,
          costPrice: costPrice || null,
          stockQty: Number(stockQty),
          reorderThreshold: Number(reorderThreshold),
          isActive: true,
        };
        saved = await createProduct(payload);
      }
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? `Edit ${product!.brand} ${product!.model}`
              : `New ${type === "frame" ? "Frame" : "Contact Lens"}`}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 px-7 pb-4">
          <input
            className="glass-input"
            placeholder="Brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
          <input
            className="glass-input"
            placeholder="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <input
            className="glass-input"
            placeholder="SKU (auto-generated if blank)"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            disabled={isEdit}
          />
          <input
            className="glass-input"
            placeholder="UPC (optional)"
            value={upc}
            onChange={(e) => setUpc(e.target.value)}
          />
          <input
            className="glass-input"
            placeholder="Retail price"
            type="number"
            step="0.01"
            value={retailPrice}
            onChange={(e) => setRetailPrice(e.target.value)}
          />
          <input
            className="glass-input"
            placeholder="Cost price (optional)"
            type="number"
            step="0.01"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
          />
          {!isEdit && (
            <input
              className="glass-input"
              placeholder="Initial stock qty"
              type="number"
              value={stockQty}
              onChange={(e) => setStockQty(e.target.value)}
            />
          )}
          <input
            className="glass-input"
            placeholder="Reorder threshold"
            type="number"
            value={reorderThreshold}
            onChange={(e) => setReorderThreshold(e.target.value)}
          />

          {type === "frame" ? (
            <>
              <input
                className="glass-input"
                placeholder="Color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <input
                className="glass-input"
                placeholder="Eye size (mm)"
                type="number"
                value={eyeSize}
                onChange={(e) => setEyeSize(e.target.value)}
              />
              <input
                className="glass-input"
                placeholder="Bridge size (mm)"
                type="number"
                value={bridgeSize}
                onChange={(e) => setBridgeSize(e.target.value)}
              />
              <input
                className="glass-input"
                placeholder="Temple size (mm)"
                type="number"
                value={templeSize}
                onChange={(e) => setTempleSize(e.target.value)}
              />
              <select
                aria-label="Gender"
                className="glass-input"
                value={gender}
                onChange={(e) =>
                  setGender(e.target.value as NonNullable<FrameAttributes["gender"]>)
                }
              >
                <option value="men">Men</option>
                <option value="women">Women</option>
                <option value="unisex">Unisex</option>
                <option value="kids">Kids</option>
              </select>
              <select
                aria-label="Material"
                className="glass-input"
                value={material}
                onChange={(e) =>
                  setMaterial(
                    e.target.value as NonNullable<FrameAttributes["material"]>,
                  )
                }
              >
                <option value="acetate">Acetate</option>
                <option value="metal">Metal</option>
                <option value="titanium">Titanium</option>
                <option value="other">Other</option>
              </select>
            </>
          ) : (
            <>
              <select
                aria-label="Modality"
                className="glass-input"
                value={modality}
                onChange={(e) =>
                  setModality(e.target.value as ContactLensAttributes["modality"])
                }
              >
                <option value="daily">Daily</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <input
                className="glass-input"
                placeholder="Base curve (mm)"
                type="number"
                step="0.1"
                value={baseCurve}
                onChange={(e) => setBaseCurve(e.target.value)}
              />
              <input
                className="glass-input"
                placeholder="Diameter (mm)"
                type="number"
                step="0.1"
                value={diameter}
                onChange={(e) => setDiameter(e.target.value)}
              />
              <input
                className="glass-input"
                placeholder="Power (D)"
                type="number"
                step="0.25"
                value={power}
                onChange={(e) => setPower(e.target.value)}
              />
              <input
                className="glass-input"
                placeholder="Box size (lenses)"
                type="number"
                value={boxSize}
                onChange={(e) => setBoxSize(e.target.value)}
              />
            </>
          )}
        </div>
        {error && (
          <div className="px-7 pb-2 text-red-300 text-sm">{error}</div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {isEdit ? "Save changes" : "Create product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
