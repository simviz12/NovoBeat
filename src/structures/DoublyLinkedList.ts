export interface Song {
  id: string;
  name: string;
  artist: string;
  album?: string;
  year?: string;
  coverArt?: string | Blob | null;
  file?: File;
  objectUrl: string;
  playCount: number;
  addedAt: number;
  note?: string;
  isFavorite?: boolean;
}

export class Node<T> {
  public data: T;
  public next: Node<T> | null = null;
  public prev: Node<T> | null = null;

  constructor(data: T) {
    this.data = data;
  }
}

export class DoublyLinkedList<T> {
  public head: Node<T> | null = null;
  public tail: Node<T> | null = null;
  public size: number = 0;

  public append(data: T): void {
    const newNode = new Node(data);
    if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      newNode.prev = this.tail;
      if (this.tail) {
        this.tail.next = newNode;
      }
      this.tail = newNode;
    }
    this.size++;
  }

  public prepend(data: T): void {
    const newNode = new Node(data);
    if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      newNode.next = this.head;
      this.head.prev = newNode;
      this.head = newNode;
    }
    this.size++;
  }

  public insertAt(data: T, index: number): void {
    if (index < 0 || index > this.size) throw new Error("Index out of bounds");
    if (index === 0) return this.prepend(data);
    if (index === this.size) return this.append(data);

    const newNode = new Node(data);
    let current = this.head;
    for (let i = 0; i < index; i++) {
      if (current) current = current.next;
    }

    if (current && current.prev) {
      newNode.next = current;
      newNode.prev = current.prev;
      current.prev.next = newNode;
      current.prev = newNode;
      this.size++;
    }
  }

  public removeAt(index: number): T | null {
    if (index < 0 || index >= this.size || !this.head) return null;

    let current = this.head;

    if (index === 0) {
      this.head = current.next;
      if (this.head) this.head.prev = null;
      else this.tail = null;
    } else if (index === this.size - 1) {
      current = this.tail as Node<T>;
      this.tail = current.prev;
      if (this.tail) this.tail.next = null;
      else this.head = null;
    } else {
      for (let i = 0; i < index; i++) {
        if (current.next) current = current.next;
      }
      if (current.prev) current.prev.next = current.next;
      if (current.next) current.next.prev = current.prev;
    }

    this.size--;
    return current.data;
  }

  public removeNode(node: Node<T>): T | null {
      if (!node) return null;

      if (node === this.head) {
          this.head = node.next;
          if (this.head) this.head.prev = null;
          else this.tail = null;
      } else if (node === this.tail) {
          this.tail = node.prev;
          if (this.tail) this.tail.next = null;
          else this.head = null;
      } else {
          if (node.prev) node.prev.next = node.next;
          if (node.next) node.next.prev = node.prev;
      }

      this.size--;
      return node.data;
  }

  public toArray(): T[] {
    const arr: T[] = [];
    let current = this.head;
    while (current) {
      arr.push(current.data);
      current = current.next;
    }
    return arr;
  }
}
